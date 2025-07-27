// Other constants.
const BYTES_PER_UINT32 = 4;
const BYTES_PER_UINT64 = 8;
const NS_PER_MS = 1000000;
// CPU constants, base (WikiChip).
const LLC_SIZE = Math.pow(2, 22); // 4 MiB
const CACHE_LINE_SIZE = BYTES_PER_UINT64;
const SET_ASSOCIATIVITY = 16;
// CPU constants, derived.
const NUM_CACHE_LINES = LLC_SIZE / CACHE_LINE_SIZE;

var evictionBuffer = new ArrayBuffer(LLC_SIZE);
var primeView = new DataView(evictionBuffer);

var victimBuffer = new ArrayBuffer(4);
var probeView = new DataView(victimBuffer);

function initEvictionBuffer(view: DataView) {
    for (var i = 0; i < NUM_CACHE_LINES - 1; i++) {
        view.setUint32(i * CACHE_LINE_SIZE, (i + 1) * CACHE_LINE_SIZE);
    }
    view.setUint32((NUM_CACHE_LINES - 1) * CACHE_LINE_SIZE, 0);
}

function newCacheSet(): number[] {
    var cache_set = [];
    for (var i = 0; i < NUM_CACHE_LINES; ++i) {
        cache_set.push(i * CACHE_LINE_SIZE);
    }
    return cache_set;
}

interface profileCacheSetResult {
    evictionSet: { address: number, speedUp: number }[],
    cacheSet: number[],
    sumSpeedUp: number,
    aveSpeedUp: number,
    speedUpCount: number,
    errorCount: number,
}

function profileCacheSet(cacheSet: number[], fuel: number, threshold: number): profileCacheSetResult {
    console.log(`[threshold = ${threshold}]`);

    var evictionSet = [];
    var sumSpeedUp = 0;
    var aveSpeedUp = 0;
    var speedUpCount = 0;
    var errorCount = 0;

    var testAddress: number, testAddressPrev: number | undefined, testAddressNext: number;
    var startAddress: number;
    var current: number, next: number;
    var cacheMissBefore, cacheMissAfter, cacheMissDiff;
    var removedTestbefore, removedTestAfter, removedTestDiff;
    var speedUp;
    for (var tryCount = 0; tryCount < fuel && cacheSet.length > 2; ++tryCount) {
        testAddress = cacheSet.pop() as number;
        testAddressNext = primeView.getUint32(testAddress);

        startAddress = cacheSet[randomInt(0, cacheSet.length - 1)] as number;
        while (startAddress === testAddress) {
            startAddress = cacheSet[randomInt(0, cacheSet.length - 1)] as number;
        }

        // DANGER ZONE

        current = probeView.getUint32(0);

        current = startAddress;
        do {
            next = primeView.getUint32(current);
            if (next === testAddress) {
                testAddressPrev = current;
            }
            current = next;
        } while (current != startAddress);
        testAddressPrev = testAddressPrev as number;
        // Postcondition: primeView.getUint32(testAddressPrev) === testAddress;

        cacheMissBefore = window.performance.now();
        current = probeView.getUint32(0);
        cacheMissAfter = window.performance.now();

        primeView.setUint32(testAddressPrev, testAddressNext);

        current = startAddress;
        do {
            current = primeView.getUint32(current);
        } while (current != startAddress);

        removedTestbefore = window.performance.now();
        current = probeView.getUint32(0);
        removedTestAfter = window.performance.now();

        // END OF DANGER ZONE

        cacheMissDiff = (cacheMissAfter - cacheMissBefore)
        removedTestDiff = (removedTestAfter - removedTestbefore)
        speedUp = cacheMissDiff - removedTestDiff;

        if (speedUp > threshold) {
            // The test address is part of the same cache set.
            evictionSet.push({ address: testAddress, speedUp: speedUp * NS_PER_MS });
            cacheSet.unshift(testAddress);
            primeView.setUint32(testAddressPrev, testAddress);
            ++speedUpCount;
            sumSpeedUp += speedUp;
            aveSpeedUp = sumSpeedUp / speedUpCount;
        } else {
            ++errorCount;
        }
    }

    return {
        cacheSet,
        evictionSet,
        sumSpeedUp: sumSpeedUp * NS_PER_MS,
        aveSpeedUp: aveSpeedUp * NS_PER_MS,
        speedUpCount,
        errorCount,
    }
}

function findEvictionSet(fuel: number, threshold: number): object {
    threshold /= NS_PER_MS;
    console.log('Starting cache profiling...');

    initEvictionBuffer(primeView);
    var cacheSet = newCacheSet();
    // Find a better name for [results].
    var results = profileCacheSet(cacheSet, 500, threshold).evictionSet as { address: number, speedUp: number }[];
    console.log(results);
    var bestResult = results.reduce((a, b) => a.speedUp > b.speedUp ? a : b);
    // The address that had the highest speed up is probably a squatter address.
    var squatterAddress = bestResult.address;
    var squatterSpeedUp = bestResult.speedUp;
    if (squatterAddress === undefined) {
        throw new Error("Failed to find squatter address");
    }
    console.log(`Found squatter address [0x${squatterAddress.toString(16)}] with speed up [${squatterSpeedUp}].`);
    // All possible other offsets that are in the same cache set as the victim
    // and the squatter address must have the same bits at positions 6-12.
    // [0xfc0] is [0b1111_1100_0000].
    cacheSet = newCacheSet().filter(addr => (addr & 0xfc0) === (squatterAddress & 0xfc0));
    for (var i = 0; i < cacheSet.length - 1; ++i) {
        primeView.setUint32(cacheSet[i] as number, cacheSet[i + 1] as number);
    }
    primeView.setUint32(cacheSet[cacheSet.length - 1] as number, cacheSet[0] as number);
    shuffleArray(cacheSet);
    console.log(`Reduced cache set has length [${cacheSet.length}]. (Should be 8192.)`);

    return profileCacheSet(cacheSet, fuel, threshold);
}

function measureCacheMissPenalty(fuel: number) {
    var view = new DataView(evictionBuffer);
    initEvictionBuffer(view);

    var tryCount = 0;
    var sumSpeedUp = 0;
    var aveSpeedUp = 0;
    var speedUpCount = 0;
    var errorCount = 0;
    var speedUps = [];

    var startAddress, current;
    var cacheMissBefore, cacheMissAfter, cacheMissDiff;
    var cacheHitBefore, cacheHitAfter, cacheHitDiff;
    while (tryCount < fuel) {
        startAddress = randomInt(0, LLC_SIZE / BYTES_PER_UINT64) * BYTES_PER_UINT64;
        current = startAddress;
        do {
            current = view.getUint32(current);
        } while (current != startAddress);

        cacheMissBefore = window.performance.now();
        current = victim;
        cacheMissAfter = window.performance.now();

        cacheHitBefore = window.performance.now();
        current = victim;
        cacheHitAfter = window.performance.now();

        cacheMissDiff = (cacheMissAfter - cacheMissBefore) * NS_PER_MS;
        cacheHitDiff = (cacheHitAfter - cacheHitBefore) * NS_PER_MS;

        if (cacheMissDiff < cacheHitDiff) {
            // A cache miss should take *longer*.
            ++errorCount;
        } else {
            ++speedUpCount;
            sumSpeedUp += cacheMissDiff - cacheHitDiff;
            aveSpeedUp = sumSpeedUp / speedUpCount;
            speedUps.push(cacheMissDiff - cacheHitDiff);
        }
        ++tryCount;
    }

    return {
        tryCount, sumSpeedUp, aveSpeedUp, speedUpCount, errorCount, speedUps
    }
}


// function profileCacheSet(
//     fuel: number,
//     threshold: number,
//     iterPerYield: number,
//     callback?: (result: object) => void,
// ) {
//     threshold /= NS_PER_MS;
//     console.log('Starting cache profiling...');
// 
//     var view = new DataView(evictionBuffer);
//     initEvictionBuffer(view);
//     var cacheSetArray = newCacheSet();
//     shuffleArray(cacheSetArray);
//     var cacheSet = listFromArray(cacheSetArray);
// 
//     var tryCount = 0;
//     var sumSpeedUp = 0;
//     var aveSpeedUp = 0;
//     var speedUpCount = 0;
//     var errorCount = 0;
// 
//     function evictAndTest() {
//         var startAddress, current, next;
//         var testAddress, testAddressPrev, testAddressNext, testAddressNextNext;
//         var cacheMissBefore, cacheMissAfter, cacheMissDiff;
//         var removedTestbefore, removedTestAfter, removedTestDiff;
// 
//         for (var i = 0; i < iterPerYield && tryCount < fuel; ++i) {
//             testAddress = popFromList(cacheSet);
//             testAddressNext = view.getUint32(testAddress);
//             testAddressNextNext = view.getUint32(testAddressNext);
// 
//             startAddress = peekFromList(cacheSet);
//             current = startAddress;
//             do {
//                 next = view.getUint32(current);
//                 // My clever optimisation!
//                 // i.e. if curr->next == testAddress
//                 if (next === testAddress) {
//                     testAddressPrev = current;
//                     current = next;
//                     break;
//                 }
// 
//                 current = next;
//             } while (current != startAddress);
//             testAddressPrev = testAddressPrev as number;
//             while (current != startAddress) {
//                 current = view.getUint32(current);
//             }
// 
//             cacheMissBefore = window.performance.now();
//             current = victim;
//             cacheMissAfter = window.performance.now();
// 
//             // We need to skip two addresses, because there are two entries in
//             // the eviction buffer per cache line.
//             view.setUint32(testAddressPrev, testAddressNextNext);
// 
//             current = startAddress;
//             do {
//                 current = view.getUint32(current);
//             } while (current != startAddress);
// 
//             removedTestbefore = window.performance.now();
//             current = victim;
//             removedTestAfter = window.performance.now();
// 
//             cacheMissDiff = (cacheMissAfter - cacheMissBefore) * NS_PER_MS;
//             removedTestDiff = (removedTestAfter - removedTestbefore) * NS_PER_MS;
// 
//             if (cacheMissDiff - removedTestDiff > threshold) {
//                 // The test address is part of the same cache set.
//                 appendToList(cacheSet, testAddress);
//                 view.setUint32(testAddressPrev, testAddress);
//                 ++speedUpCount;
//                 sumSpeedUp += cacheMissDiff - removedTestDiff;
//                 aveSpeedUp = sumSpeedUp / speedUpCount;
//             } else {
//                 ++errorCount;
//             }
//             ++tryCount;
// 
//         }
// 
//         if (tryCount < fuel) {
//             setTimeout(evictAndTest, 0);
//             console.log(
//                 Math.floor(tryCount / fuel * 10000) / 100
//                     + '% completed. '
//                     + '[aveSpeedUp = ' + aveSpeedUp + '] '
//                     + '[cacheSet.length = ' + cacheSet.length + ']'
//             );
//             return;
//         }
// 
//         if (callback) {
//             console.log('Finished cache profiling!')
//             callback({
//                 evictionSet: arrayFromList(cacheSet),
//                 sumSpeedUp,
//                 aveSpeedUp: aveSpeedUp,
//                 speedUpCount,
//                 errorCount,
//             })
//         }
//     }
// 
//     evictAndTest();
// }

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min)) + min;
}

function randomInts(min: number, max: number, count: number): number[] {
    var ret = [];
    for (var i = 0; i < count; ++i) {
        ret.push(randomInt(min, max));
    }
    return ret;
}

function shuffleArray(array: number[]) {
    for (var i = array.length - 1; i > 0; --i) {
        var j = randomInt(0, i - 1);
        var temp = array[i] as number;
        array[i] = array[j] as number;
        array[j] = temp;
    }
}

interface List {
    head: ListNode | null,
    tail: ListNode | null,
    length: number,
}

interface ListNode {
    value: number,
    next: ListNode | null,
}

function newList(): List {
    return { head: null, tail: null, length: 0 };
}

function newNode(value: number): ListNode {
    return { value, next: null };
}

function appendToList(list: List, value: number) {
    var node = newNode(value);
    ++list.length;
    if (list.head === null) {
        list.head = node;
        list.tail = node;
    } else if (list.head === list.tail) {
        list.head.next = node;
        list.tail = node;
    } else {
        if (list.tail !== null) {
            list.tail.next = node;
            list.tail = node;
        } else {
            unreachable();
        }
    }
}

function popFromList(list: List): number {
    if (list.head !== null) {
        var ret = list.head.value;
        list.head = list.head.next;
        --list.length;
        return ret;
    }
    unreachable();
}

function peekFromList(list: List): number {
    if (list.head !== null) {
        return list.head.value;
    }
    unreachable();
}

function listFromArray(array: number[]) {
    var list = newList();
    for (var i = 0; i < array.length; ++i) {
        appendToList(list, array[i] as number);
    }
    return list;
}

function arrayFromList(list: List): number[] {
    var array = [];
    while (list.length > 0) {
        array.push(popFromList(list));
    }
    return array;
}

function unreachable(): never {
    throw new Error('unreachable');
}

// Graveyard

var victim = 0;

function removeFromEvictionBuffer(view: DataView, address: number, headAddress: number) {
    // Essentially linked list deletion.
    var current = headAddress;
    do {
        if (view.getUint32(current) == address) {
            view.setUint32(current, view.getUint32(address));
        }
        current = view.getUint32(current);
    } while (current != headAddress);
}

function testRemoveFromEvictionBuffer() {
    var buffer = new ArrayBuffer(16);
    var view = new DataView(buffer);
    view.setUint32(0, 4);
    view.setUint32(4, 8);
    view.setUint32(8, 12);
    view.setUint32(12, 0);
    removeFromEvictionBuffer(view, 8, 0);

    if (view.getUint32(0) == 4 && view.getUint32(4) == 12 && view.getUint32(8) == 12 && view.getUint32(12) == 0) {
        console.log('[removeFromEvictionBuffer] tests pass');
    } else {
        console.log('[removeFromEvictionBuffer] tests fail');
    }
}
testRemoveFromEvictionBuffer();

// function profileCacheSetOld(fuel: number, threshold: number) {
//     threshold /= NS_PER_MS;
//
//     var view = new DataView(evictionBuffer);
//     initEvictionBuffer(view);
//     var cacheSet = newCacheSet();
//     shuffleArray(cacheSet);
//
//     var tryCount = 0;
//     var sumSpeedUp = 0;
//     var aveSpeedUp = 0;
//     var speedUpCount = 0;
//     var errorCount = 0;
//
//     var startAddress, current;
//     var testAddress, testAddressPrev, testAddressNext;
//     var cacheMissBefore, cacheMissAfter, cacheMissDiff;
//     var removedTestbefore, removedTestAfter, removedTestDiff;
//     while (tryCount < fuel && cacheSet.length > 10) {
//         testAddress = cacheSet.pop() as number;
//         testAddressNext = view.getUint32(testAddress);
//
//         // Do not use [testAddress] as the starting address.
//         startAddress = cacheSet[randomInt(0, cacheSet.length - 1)] as number;
//         while (startAddress === testAddress) {
//             startAddress = cacheSet[randomInt(0, cacheSet.length - 1)] as number;
//         }
//         current = startAddress;
//         do {
//             // My clever optimisation!
//             // i.e. if curr->next == testAddress
//             if (view.getUint32(current) === testAddress) {
//                 testAddressPrev = current;
//             }
//
//             current = view.getUint32(current);
//         } while (current != startAddress);
//         testAddressPrev = testAddressPrev as number;
//
//         cacheMissBefore = window.performance.now();
//         current = victim;
//         cacheMissAfter = window.performance.now();
//
//         view.setUint32(testAddressPrev, testAddressNext);
//
//         current = startAddress;
//         do {
//             current = view.getUint32(current);
//         } while (current != startAddress);
//
//         removedTestbefore = window.performance.now();
//         current = victim;
//         removedTestAfter = window.performance.now();
//
//         cacheMissDiff = (cacheMissAfter - cacheMissBefore) * NS_PER_MS;
//         removedTestDiff = (removedTestAfter - removedTestbefore) * NS_PER_MS;
//
//         if (cacheMissDiff - removedTestDiff > threshold) {
//             // The test address is part of the same cache set.
//             cacheSet.push(testAddress);
//             view.setUint32(testAddressPrev, testAddress);
//             ++speedUpCount;
//             sumSpeedUp += cacheMissDiff - removedTestDiff;
//             aveSpeedUp = sumSpeedUp / speedUpCount;
//         } else {
//             ++errorCount;
//         }
//         ++tryCount;
//     }
//
//     return {
//         evictionSet: cacheSet, sumSpeedUp, aveSpeedUp, speedUpCount, errorCount
//     }
// }

