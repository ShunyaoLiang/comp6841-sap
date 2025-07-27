//! The following specifications are for the Intel i7-6600U. See:
//! [https://en.wikichip.org/wiki/intel/core_i7/i7-6600u].

use std::{
    hint::black_box,
    ops::{Add, Range, Sub},
};
use wasm_bindgen::prelude::*;

/// Assume that the page size is 4KB.
const PAGE_SIZE_BITS: u32 = 12;
const PAGE_SIZE: usize = usize::pow(2, PAGE_SIZE_BITS);

/// The size of the LLC (the L3 cache) is 4MB.
const LLC_SIZE: usize = usize::pow(2, 22);

/// The number of cache sets is 4096.
const NUM_CACHE_SETS: u32 = 4096;

/// The LLC is 16-way set associative. Known as `l` in the paper.
const LLC_ASSOCIATIVITY: u32 = 16;

/// The size of a cache line is 64 bytes;
const CACHE_LINE_SIZE: usize = 64;

const EVICTION_BUFFER: [u8; LLC_SIZE] = [0; LLC_SIZE];

fn create_cache_set() -> Vec<usize> {
    // Each address in the cache set is the first address of each cache line
    // boundary.
    Vec::from_iter((0..(LLC_SIZE / CACHE_LINE_SIZE)).map(|x| x * CACHE_LINE_SIZE))
}

/// Find the addresses that are in the same cache set as the victim address. The
/// victim address is referred to as `x` in the paper.
fn profile_cache_set(
    victim_address: usize,
    mut k: usize,
    thres: f64,
    performance: &web_sys::Performance,
) -> Option<Box<[usize]>> {
    assert!(victim_address < EVICTION_BUFFER.len());
    let mut cache_set: Vec<usize> = create_cache_set();
    while k > 0 && cache_set.len() > 0 {
        // Iteratively access all elements of the cache set.
        for &i in &cache_set {
            black_box(EVICTION_BUFFER[i]);
        }
        // Measure `t1` the time it takes to access the victim address.
        let t1 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        // Select a random page `s` from the cache set and remove it.
        let s = {
            let i = random_range(0..cache_set.len());
            cache_set.swap_remove(i)
        };
        // Iteratively access all elements of the cache set without `s`.
        for &i in &cache_set {
            black_box(EVICTION_BUFFER[i]);
        }
        // Measure `t2` the time it takes to access the victim address.
        let t2 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        // If removing `s` caused the memory access to speed up, then `s` is in
        // the same cache set as `x`.
        if t1 - t2 > thres {
            cache_set.push(s);
        };

        k -= 1;
    }
    cache_set.sort();
    //match cache_set.len() == LLC_ASSOCIATIVITY as usize {
    //    true => Some(cache_set.into_boxed_slice()),
    //    false => None,
    //}
    Some(cache_set.into_boxed_slice())
}

#[wasm_bindgen(js_name = profileCacheSet)]
pub fn profile_cache_set_with_bench(
    victim_address: usize,
    k: usize,
    thres: f64,
    performance: &web_sys::Performance,
) -> Option<Box<[usize]>> {
    web_sys::console::time_with_label("profileCacheSet");
    let eviction_set = profile_cache_set(victim_address, k, thres, performance);
    web_sys::console::time_end_with_label("profileCacheSet");
    eviction_set
}

// const THRESHOLD: f64 = 0.000_025;

#[wasm_bindgen]
pub struct CacheProfiler {
    /// The size of this buffer is `LLC_SIZE`.
    eviction_buffer: Box<[u32]>,
    performance: web_sys::Performance,
}

pub struct ProfileResult {
    pub eviction_set: Option<Box<usize>>,
    pub average_speed_up: f64,
    pub error_count: u32,
}

#[wasm_bindgen]
impl CacheProfiler {
    #[wasm_bindgen(constructor)]
    pub fn new(performance: web_sys::Performance) -> Self {
        CacheProfiler {
            eviction_buffer: vec![0; LLC_SIZE / 4].into_boxed_slice(),
            performance: performance,
        }
    }

    pub fn profile_cache_set(&mut self, fuel: u32, threshold: f64) -> ProfileResult {
        let x = Box::<u32>::new(0);

        let mut cache_set: Vec<usize> = create_cache_set();
        let mut error_count = 0;
        let mut try_count = 0;
        while cache_set.len() > 0 && try_count < fuel {
            for i in 0..(self.eviction_buffer.len() - 1) {
                self.eviction_buffer[i] = (i as u32) + 1;
            }
            *self.eviction_buffer.last_mut().unwrap() = 0;

            let start_address = random_range(0..(self.eviction_buffer.len()) as u32);
            let mut i = start_address;
            loop {
                i = black_box(self.eviction_buffer[i as usize]);
                if i == start_address {
                    break;
                }
            }

            let t1 = {
                let before = self.performance.now();
                i = black_box(self.eviction_buffer[victim_address / 4]);
                self.performance.now() - before
            };

            let s = {
                let i = random_range(0..cache_set.len());
                cache_set.swap_remove(i)
            };

            try_count += 1;
        }

        ProfileResult {
            eviction_set: None,
            average_speed_up: 0.0,
            error_count,
        }
    }
}

fn random_range(range: Range<u32>) -> u32 {
    use js_sys::Math;
    Math::floor(Math::random() * (range.end - range.start) as f64) as u32 + range.start
}

fn measure_cache_miss_penalty(
    victim_address: usize,
    performance: &web_sys::Performance,
) -> (usize, Box<[f64]>, Box<[f64]>) {
    assert!(victim_address % PAGE_SIZE == 0);
    assert!(victim_address < EVICTION_BUFFER.len());

    let cache_set: Vec<usize> = create_cache_set();
    let mut diffs: Vec<(usize, f64)> = Vec::with_capacity(cache_set.len());
    for &s in &cache_set {
        // Iteratively access all elements of the cache set.
        for &i in &cache_set {
            black_box(EVICTION_BUFFER[i]);
        }
        // Measure `t1` the time it takes to access the victim address.
        let t1 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        // Iteratively access all elements of the cache set without `s`.
        for &i in &cache_set {
            if i != s {
                black_box(EVICTION_BUFFER[i]);
            }
        }
        // Measure `t2` the time it takes to access the victim address.
        let t2 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        // Record the time difference.
        diffs.push((s, t1 - t2));
    }
    // Assume that the address that causes the biggest difference in time taken
    // to access the victim address must be in the same cache set as it.
    let &(in_same_cache_set, _) = diffs
        .iter()
        .max_by(|(_, td1), (_, td2)| td1.partial_cmp(td2).unwrap())
        .unwrap();

    let mut diffs2: Vec<f64> = Vec::with_capacity(1000);
    for _ in 0..1000 {
        for &i in &cache_set {
            black_box(EVICTION_BUFFER[i]);
        }
        let t1 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        for &i in &cache_set {
            if i != in_same_cache_set {
                black_box(EVICTION_BUFFER[i]);
            }
        }
        let t2 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        diffs2.push(t1 - t2);
    }

    // Measure timings of a cache hit.
    let mut diffs3: Vec<f64> = Vec::with_capacity(1000);
    for _ in 0..1000 {
        let t1 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        let t2 = {
            let before = performance.now();
            black_box(EVICTION_BUFFER[victim_address]);
            performance.now() - before
        };
        diffs3.push(t1 - t2);
    }

    (
        in_same_cache_set,
        diffs2.into_boxed_slice(),
        diffs3.into_boxed_slice(),
    )
}

#[wasm_bindgen]
pub struct CalibratePorcelainRet {
    pub in_same_cache: usize,
    with_cache_miss: Box<[f64]>,
    nothing: Box<[f64]>,
}

#[wasm_bindgen]
impl CalibratePorcelainRet {
    #[wasm_bindgen(getter)]
    pub fn with_cache_miss(&self) -> Box<[f64]> {
        self.with_cache_miss.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn nothing(&self) -> Box<[f64]> {
        self.nothing.clone()
    }
}

#[wasm_bindgen]
pub fn calibrate_porcelain(
    window: &web_sys::Window,
    victim_address: usize,
) -> CalibratePorcelainRet {
    let performance = window.performance().unwrap();
    let (c, a, b) = measure_cache_miss_penalty(victim_address, &performance);
    CalibratePorcelainRet {
        in_same_cache: c,
        with_cache_miss: a,
        nothing: b,
    }
}

#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
}
