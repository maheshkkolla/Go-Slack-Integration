var request = require('./request.js');
var fs = require('fs');
var goData = JSON.parse(fs.readFileSync("./config.json"));

var run = function() {
	request.requestGo(goData.go, function(result) {
		fs.writeFileSync("./build.json", JSON.stringify(result));
	});
}

run();