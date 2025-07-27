self.onmessage = function(event) {
    var [buffer] = event.data;
    var arr = new Uint32Array(buffer);
    self.postMessage(0);
    while(1)
    {
        arr[0]++;
    }
}
