var request = require('./request.js');
var fs = require('fs');
var data = JSON.parse(fs.readFileSync("./config.json"));
var Slack = require('slack-node');
var buildStatus = JSON.parse(fs.readFileSync("./lastBuildStatus.json"));
var domain = require('domain').create();

var sendToSlack = function(message, slackData) {
	var slack = new Slack();
	slack.setWebhook(slackData.webhook);
 	slack.webhook({
		channel: slackData.channel,
		username: slackData.userName,
		text: message
	} ,function(err,response){
		err && console.log("["+new Date()+"]\tError at sending message to slack:",err);
		console.log("["+new Date()+"]\tResponse from slack:",response.status);
	});
}

var isFailingBuild = function(build) {
	return (build.lastBuildStatus == 'Failure');	
}

var hasBuildChanged = function(build) {
	return(build.lastBuildStatus != buildStatus[build.name]);
}

var getMessageForBuild = function(build) {
	var message = build.name+"\t *"+build.lastBuildStatus+"*\n";
	message += "Build label: "+build.lastBuildLabel+"\n";
	message += build.webUrl; 
	return message;
}

var getLogForBuild = function(build) {
	return("Updating Build " + build.lastBuildStatus + "...");
}

var updateLastBuildStatusFor = function(build) {
	buildStatus[build.name] = build.lastBuildStatus;
	fs.writeFileSync("./lastBuildStatus.json", JSON.stringify(buildStatus));
}

var handleTheBuild = function(build, callback) {
	if(hasBuildChanged(build)) {
		var message = getMessageForBuild(build);
		var log = getLogForBuild(build);
		callback(log, message);
		updateLastBuildStatusFor(build);
	}
}

var handleGoData = function(goData, callback) {
	var builds = goData.Projects.Project;
	builds.forEach(function(project) {
		var build = project['$'];
		handleTheBuild(build, callback);
	});	
}

var run = function() {
	console.log("Requesting Go ...");
	request.requestGo(data.go, function(result) {
		handleGoData(result, function(log, message) {
			log && console.log("["+new Date()+"]\t"+log);
			message && sendToSlack(message,data.slack);
		});
	});
	setTimeout(run,10000);
}

domain.on('error', function(error) {
	console.log("["+new Date()+"]\t***** Error occurred: *****\n"+error);
	console.log("\n##### Program didn,t stop, It is Running #####\n")
});

domain.run(run);
