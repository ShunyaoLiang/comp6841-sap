//! The following specifications are for the Intel i7-6600U. See:
//! [https://en.wikichip.org/wiki/intel/core_i7/i7-6600u].

use std::{hint::black_box, ops::Range};
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

#[wasm_bindgen]
pub struct CacheProfiler {
    /// The size of this buffer is [LLC_SIZE].
    eviction_buffer: Box<[u32]>,
    victim: Box<u32>,
    performance: web_sys::Performance,
}

#[wasm_bindgen]
impl CacheProfiler {
    #[wasm_bindgen(constructor)]
    pub fn new(performance: web_sys::Performance) -> Self {
        CacheProfiler {
            eviction_buffer: vec![0; LLC_SIZE / 4].into_boxed_slice(),
            victim: Box::new(0),
            performance: performance,
        }
    }

    #[wasm_bindgen(js_name = profileCacheSet)]
    pub fn profile_cache_set(&mut self, fuel: u32, threshold: f64) -> ProfileResult {
        // Aliases.
        let buf = &mut self.eviction_buffer;
        let n: u32 = buf
            .len()
            .try_into()
            .expect("Eviction buffer is larger than can be addressed by a [u32].");
        // Initialise the eviction buffer.
        //for i in 0..n {
        //    buf[i as usize] = (i + 1) % n;
        //}

        let mut cache_set: Vec<u32> = create_cache_set();
        let mut try_count = 0;
        let mut sum_speed_up = 0.0;
        let mut average_speed_up = 0.0;
        let mut error_count = 0;
        while cache_set.len() > 0 && try_count < fuel {
            //let start_address = random_range(0..n);
            //let mut i = start_address;
            //loop {
            //    i = buf[i as usize];
            //    if i == start_address {
            //        break;
            //    }
            //}
            for &i in &cache_set {
                black_box(buf[black_box(i as usize)]);
            }

            let t1 = {
                let before = self.performance.now();
                black_box(access_victim_variable(&self.victim));
                self.performance.now() - before
            };

            let s = {
                let to_remove = random_range(0..(cache_set.len() as u32));
                cache_set.swap_remove(to_remove as usize)
            };
            //{
            //    let curr_next = *buf.get(s as usize).unwrap();
            //    let prev = buf.get_mut(((s - 1) % n) as usize).unwrap();
            //    *prev = curr_next;
            //}

            //i = start_address;
            //loop {
            //    i = buf[i as usize];
            //    if i == start_address {
            //        break;
            //    }
            //}
            for &i in &cache_set {
                black_box(buf[black_box(i as usize)]);
            }

            let t2 = {
                let before = self.performance.now();
                black_box(access_victim_variable(&self.victim));
                self.performance.now() - before
            };

            match t1 - t2 > threshold {
                false => error_count += 1,
                true => {
                    cache_set.push(s);
                    sum_speed_up += t1 - t2;
                    average_speed_up = sum_speed_up / (try_count as f64 + 1.0);
                    //                    let prev = buf.get_mut(((s - 1) % n) as usize).unwrap();
                    //                    *prev = s;
                }
            }

            try_count += 1;
        }

        cache_set.sort();
        ProfileResult {
            eviction_set: cache_set.into_boxed_slice(),
            try_count,
            sum_speed_up: sum_speed_up * 1_000_000.0,
            average_speed_up: average_speed_up * 1_000_000.0,
            error_count,
        }
    }
}

fn access_victim_variable(victim: &Box<u32>) -> u32 {
    let ptr = black_box(victim.as_ref() as *const u32);
    // Safety: This function is only called to read from boxed variables we own.
    let value = unsafe { black_box(std::ptr::read_volatile(ptr)) };
    black_box(value)
}

#[wasm_bindgen]
pub struct ProfileResult {
    eviction_set: Box<[u32]>,
    pub try_count: u32,
    pub sum_speed_up: f64,
    pub average_speed_up: f64,
    pub error_count: u32,
}

#[wasm_bindgen]
impl ProfileResult {
    #[wasm_bindgen(getter)]
    pub fn eviction_set(&self) -> Box<[u32]> {
        self.eviction_set.clone()
    }
}

/// Each address in the cache set is an index into an eviction buffer such that
/// it marks the beginning of a cache line.
fn create_cache_set() -> Vec<u32> {
    let num_cache_lines: u32 = (LLC_SIZE / CACHE_LINE_SIZE)
        .try_into()
        .expect("More cache lines than can be represented by a [u32].");
    Vec::from_iter((0..num_cache_lines).map(|x| 2 * x))
}

fn random_range(range: Range<u32>) -> u32 {
    use js_sys::Math;
    Math::floor(Math::random() * (range.end - range.start) as f64) as u32 + range.start
}

#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
}
