const { init, CacheProfiler } = wasm_bindgen;

function standardDeviation(array : number[]) {
    const n = array.length
    const mean = array.reduce((a, b) => a + b) / n
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
}

// TypeScript is a travesty of a language.
function getElementByIdOrThrow<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element with id '${id}' not found`);
    }
    return element as T;
}

var profiler = undefined;

(async () => {
    console.log('Initialising WASM module...');
    await wasm_bindgen();
    console.log('Done initialising WASM module.');
    init();
    console.log('Initialised [tc-spy-wasm]')

    profiler = new CacheProfiler(window.performance);

    const form = getElementByIdOrThrow<HTMLFormElement>('calibrate-form');
    // const victimAddressInput = getElementByIdOrThrow<HTMLInputElement>('calibrate-form-victim-address');
    // const downloadTimingsAnchor = getElementByIdOrThrow<HTMLAnchorElement>('download-timings-anchor');

    form.addEventListener('submit', function (e) {
        e.preventDefault();

        // console.log('Running calibration...');
        // const victimAddress = parseInt(victimAddressInput.value, 10);
        // const ret = calibrate_porcelain(window, victimAddress);
        // const data = [Array.from(ret.with_cache_miss), Array.from(ret.nothing)];

        // console.log(diffs);

        // const average = array => array.reduce((a, b) => a + b) / array.length;
        // console.log("average: ", average(diffs));
        // console.log("stddev: ", getStandardDeviation(diffs));

        // const data = Array.from(diffs);
        // const jsonString = JSON.stringify(data, null, 2);
        // const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
        // downloadTimingsAnchor.hidden = false;
        // downloadTimingsAnchor.href = dataUrl;
        // downloadTimingsAnchor.download = 'timings.json';
    });
})();
