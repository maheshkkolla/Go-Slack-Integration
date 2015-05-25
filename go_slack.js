var request = require('./request.js');
var fs = require('fs');
var data = JSON.parse(fs.readFileSync("./config.json"));
var Slack = require('slack-node');
var buildStatus = JSON.parse(fs.readFileSync("./lastBuildStatus.json"));
var domain = require('domain').create();
var messages = {};

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
	return(build.lastBuildStatus != buildStatus[getFirstNameOf(build)]);
}

messages['Failure'] = function(build) {
	var breaker = "Someone";
	if(build.messages) breaker = build.messages[0].message[0]['$'].text;
	var message = "*"+breaker+"* broke *"+getFirstNameOf(build['$'])+"*. I hope "+breaker+" is looking into it.\n";
	message += build['$'].webUrl;
	return message;
}

messages['Success'] = function(build) {
	var message = "I am glad that someone fixed *"+getFirstNameOf(build['$'])+"*\n";
	message += build['$'].webUrl;
	return message;
}


var getLogForBuild = function(build) {
	return("Updating Build " + build.lastBuildStatus + "...");
}

var updateLastBuildStatusFor = function(build) {
	buildStatus[getFirstNameOf(build)] = build.lastBuildStatus;
	fs.writeFileSync("./lastBuildStatus.json", JSON.stringify(buildStatus));
}

var handleTheBuild = function(buildGroup, callback) {
	var build = buildGroup[0];
	if(hasBuildChanged(build['$'])) {
		var message = messages[build['$'].lastBuildStatus](build);
		var log = getLogForBuild(build['$']);
		callback(log, message);
		updateLastBuildStatusFor(build['$']);
	}
}

var getFirstNameOf = function(build) {
	return build.name.split('::')[0];
}

var combineTheBildsOfSameName = function(builds) {
	var combinedBuilds = {};
	builds.forEach(function(build) {
		if(combinedBuilds[getFirstNameOf(build['$'])]){
			combinedBuilds[getFirstNameOf(build['$'])].push(build);
		}else {
			combinedBuilds[getFirstNameOf(build['$'])] = [];
			combinedBuilds[getFirstNameOf(build['$'])].push(build);
		}
	});
	return combinedBuilds;
}

var sortByName = function(buildGroup) {
	return buildGroup.sort(function(pre, cur) {
		return(pre['$'].name - cur['$'].name);
	});
}

var handleGoData = function(goData, callback) {
	var builds = goData.Projects.Project;
	builds = combineTheBildsOfSameName(builds);
	var buildNames = Object.keys(builds);
	buildNames.forEach(function(buildName){
		buildGroup = sortByName(builds[buildName]);
		handleTheBuild(buildGroup, callback);
	});
}

var run = function() {
	console.log("["+new Date()+"]\tRequesting Go ...");
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

