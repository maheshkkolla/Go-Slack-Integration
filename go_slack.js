var request = require('./request.js');
var fs = require('fs');
var Slack = require('slack-node');
var domain = require('domain').create();
var data = JSON.parse(fs.readFileSync("./config.json"));
var buildStatus = JSON.parse(fs.readFileSync("./lastBuildStatus.json"));
var FAILURE_MESSAGE = "*@USER@* broke <@URL@|@BUILD@>. I hope @USER@ looking into it.\n";
var SUCCESS_MESSAGE = "I am glad that someone fixed <@URL@|@BUILD@>.\n";
var messages = {};


var dateStamp = function() {
	return("["+new Date()+"]\t");
}

var sendToSlack = function(message, slackData) {
	var slack = new Slack();
	slack.setWebhook(slackData.webhook);
 	slack.webhook({
		channel: slackData.channel,
		username: slackData.userName,
		text: message
	} ,function(err,response){
		err && console.log(dateStamp()+"Error at sending message to slack:",err);
		console.log(dateStamp()+"Response from slack:",response.status);
	});
}

var hasBuildChanged = function(build) {
	return(build['$'].lastBuildStatus != buildStatus[getFirstNameOf(build)]);
}

messages['Failure'] = function(build) {
	var breaker = "Someone";
	(build.messages) && (breaker = build.messages[0].message[0]['$'].text.split("<")[0]);
	var message = FAILURE_MESSAGE;
	message = message.replace(/@USER@/g,breaker);
	message = message.replace(/@URL@/g,build['$'].webUrl);
	message = message.replace(/@BUILD@/g,getFirstNameOf(build));
	return message;
}

messages['Success'] = function(build) {
	var message = SUCCESS_MESSAGE;
	message = message.replace(/@URL@/g,build['$'].webUrl);
	message = message.replace(/@BUILD@/g,getFirstNameOf(build));
	return message;
}


var getLogForBuild = function(build) {
	return("Updating Build " + build.lastBuildStatus + "...");
}

var updateLastBuildStatusFor = function(build) {
	buildStatus[getFirstNameOf(build)] = build['$'].lastBuildStatus;
	fs.writeFileSync("./lastBuildStatus.json", JSON.stringify(buildStatus));
}

var handleTheBuild = function(buildGroup, callback) {
	var build = buildGroup[0];
	if(hasBuildChanged(build)) {
		var message = messages[build['$'].lastBuildStatus](build);
		var log = getLogForBuild(build['$']);
		callback(log, message);
		updateLastBuildStatusFor(build);
	}
}

var getFirstNameOf = function(build) {
	return build['$'].name.split('::')[0];
}

var combineTheBuildsOfSameName = function(builds) {
	var combinedBuilds = {};
	builds.forEach(function(build) {
		var buildName = getFirstNameOf(build);
		if(combinedBuilds[buildName])
			combinedBuilds[buildName].push(build);
		else {
			combinedBuilds[buildName] = [];
			combinedBuilds[buildName].push(build);
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
	builds = combineTheBuildsOfSameName(builds);
	var buildNames = Object.keys(builds);
	buildNames.forEach(function(buildName){
		buildGroup = sortByName(builds[buildName]);
		handleTheBuild(buildGroup, callback);
	});
}

var run = function() {
	console.log(dateStamp()+"Requesting Go ...");
	request.requestGo(data.go, function(result) {
		handleGoData(result, function(log, message) {
			log && console.log(dateStamp()+""+log);
			message && sendToSlack(message,data.slack);
		});
	});
	setTimeout(run,10000);
}

domain.on('error', function(error) {
	console.log(dateStamp()+"***** Error occurred: *****\n"+error);
	console.log("\n##### Program didn't stop, It is Running #####\n")
});

domain.run(run);

