//global variables
var playerManager;

//global functions
function onNicoPlayerReady() {
	/*
	Event.observe("niconicoPlayer", "mousewheel", handleOnWheel, false);
	Event.observe("niconicoPlayer", "DOMMouseScroll", handleOnWheel, false); // Firefox
	new SWFMacMouseWheel(so);
	*/
}

function isNicoVideoId(videoId) {
	const regExprNicoVideoId = /^(\w\w\d+)$|^(\d+)$/;
	return videoId.match(regExprNicoVideoId);
};

function onLoad() {
	playerManager = createPlayerManager();
}

function onYouTubePlayerReady(playerId) {
	ytplayer = document.getElementById(playerId);
	ytplayer.addEventListener("onStateChange", "onPlayerStateChange");
	playerManager.setYTPlayer(ytplayer);
	playerManager.changeVideoSite();
}

// niconico states: end buffering seeking playing load connectionError disconnected stopped paused
// youtube states: 未開始 (-1)、終了済み (0)、再生中 (1)、一時停止中 (2)、バッファ中 (3)、動画キュー (5) 
function onPlayerStateChange(newState) {
	switch(newState) {
	case "end":
	case 0:
		newState = 0;
		break;
	case "playing":
	case 1:
		if (!playerManager.isLoaded) {
			// youtube api doesn't fire a video cued event...
			onPlayerStateChange("load"); //load
			return;
		}

		playerManager.play();
		newState = 1;
		break;
	case "paused":
	case 2:
		newState = 2;
		break;
	case "buffering":
	case 3:
		newState = 3;
		break;
	case "load":
	case 5:
		playerManager.play();
		playerManager.isLoaded = true;
		newState = 5;
		playerManager.onResize();
		scrollTo(window.scrollX, 500);
		
		if (!playerManager.isCheckingPeriodically) {
			playerManager.isCheckingPeriodically = true;
			playerManager.checkPeriodically();
		}
		break;
	case "need login":	//This isn't an official state. I created.
		newState = -100;
		break;
	default:
		return;
	}

	document.getElementById("txtStateChangeValue").value = newState;
	document.getElementById("btnOnPlayerStateChange").click();
}

/*  niconicoSite class
	
 */
var niconicoSite = function() {
	var that = {};
	var player;
	var oldState = "buffering";
	var errorCount = 0;
	const errorCountforLogin = 40;
	
	that.play = function() {
		player.ext_play(1);
	};
	
	that.pause = function() {
		if (player) {
			player.ext_play(0);
		}
	};
	
	that.changeVolume = function(volume) {
		player.ext_setVolume(volume);
	};
	
	that.changeSize = function() {
		if (player) {
//			player.ext_setVideoSize("fit");
		}
	};
	
	that.mute = function() {
		player.ext_setMute(true);
	};
	
	that.unmute = function() {
		player.ext_setMute(false);
	};
	
	that.seekTo = function(seekValue) {
		player.ext_setPlayheadTime(seekValue);
	};
	
	that.updatePlayerStatus = function() {
		try {
			//Check player status
			var newState = player.ext_getStatus();
			if (newState != oldState) {
				oldState = newState;
				onPlayerStateChange(newState);
			}
		} catch(e) {
			errorCount++;
			if (errorCount >= errorCountforLogin) {
				errorCount = 0;
				onPlayerStateChange("need login");
				playerManager.stopCheckingPeriodically();
			}
			
			return false;
		}
		
		return true;
	};
	
	that.get_loadedRatio = function() {
		try {
			return loadedRatio = player.ext_getLoadedRatio();
		} catch(e) {
			return 0;
		}
	};
	
	that.get_currentTime = function() {
		try {
			return player.ext_getPlayheadTime();
		} catch(e) {
			return 0;
		}
	};
	
	that.load = function(videoId, func) {
		var so = new SWFObject("http://www.nicovideo.jp/swf/new/nicoplayer.swf?ts=1249288805", "flvplayer", "952", "512", 9, "#FFFFFF");
		so.addVariable("v",  videoId);
		so.addVariable("videoId", videoId);
		so.addVariable("wv_id", videoId);
		so.addParam("allowScriptAccess", "always");
		so.addParam("allowFullScreen", "true");
		so.write("flvplayer_container");
		
		player = document.getElementById("flvplayer");
		errorCount = 0;
		playerManager.checkPeriodically();
	};
	
	return that;
};

/*  youtubeSite class
	
 */
var youtubeSite = function () {
	var that = {};
	var ytplayer = null;
	var playerId = "embedYTPlayer";
	
	that.play = function () {
		ytplayer.playVideo();
	};

	that.pause = function () {
		if (ytplayer) {
			ytplayer.pauseVideo();
		}
	};
	
	that.changeVolume = function(volume) {
		ytplayer.setVolume(volume);
	};
	
	that.mute = function() {
		ytplayer.mute();
	};
	
	that.unmute = function() {
		ytplayer.unMute();
	};

	that.load = function (videoId) {
		if (!ytplayer) {
			that.embedYoutubeSWF();
			return;
		}
		
		ytplayer.loadVideoById(videoId, 0);
	};
	
	that.seekTo = function(seekValue) {
		ytplayer.seekTo(seekValue, false);
	};
	
	that.embedYoutubeSWF = function() {
		var params={ allowScriptAccess: "always" };
		var atts={ id: playerId };

		swfobject.embedSWF("http://www.youtube.com/v/ma9I9VBKPiw?enablejsapi=1&amp;playerapiid=embedYTPlayer", "youtubePlayer", "1000", "480", "8", null, null, params, atts);
	};
	
	that.getPlayerId = function() {
		return playerId;
	};
	
	that.setPlayer = function(player) {
		ytplayer = player;
	};
	
	that.changeSize = function(width, height) {
		if (ytplayer) {
			ytplayer.setSize(width - 30, "480");
		}
	};
	
	that.updatePlayerStatus = function() {
		return playerManager.isLoaded;
	};
	
	that.get_loadedRatio = function() {
		if (ytplayer) {
			return ytplayer.getVideoBytesLoaded() / ytplayer.getVideoBytesTotal();
		}
	};
	
	that.get_currentTime = function() {
		if (ytplayer) {
			return ytplayer.getCurrentTime();
		}
	};
	
	return that;
};

/*  playerManager class
	
 */
var createPlayerManager = function() {
	var that = {};
	var playingVideoSite;
	var videoId;
	var niconico = niconicoSite();
	var youtube = youtubeSite();
	var waitTime = 500;  //milliseconds. if you change this value, you must change var errorCountforLogin of niconicoSite class.
	that.isCheckingPeriodically = false;
	var stopCheckingPeriodically = false;
	that.isLoaded = false;
	that.isPlaying = false;
	
	that.changeVideoSite = function () {
		videoId = document.getElementById("txtVideoId").value;
		var ytplayer = document.getElementById(youtube.getPlayerId());
		if (isNicoVideoId(videoId)) {
			playingVideoSite = niconico;
			youtube.pause();
			if (ytplayer !== null) {
				ytplayer.style.visibility = "hidden";
			}
			
			document.getElementById("flvplayer_container").style.visibility = "visible";
		} else {
			playingVideoSite = youtube;
			niconico.pause();
			if (ytplayer !== null) {
				ytplayer.style.visibility = "visible";
			}
			
			document.getElementById("flvplayer_container").style.visibility= "hidden";
		}
		
		// auto load
		that.load();
	};
	
	that.checkPeriodically = function() {
		if (stopCheckingPeriodically) {
			stopCheckingPeriodically = false;
			return;
		}
		
		if (playingVideoSite.updatePlayerStatus()) {
			var loadedRatio = playingVideoSite.get_loadedRatio();
			
			if (loadedRatio && 0 <= loadedRatio && loadedRatio <= 1) {
				document.getElementById("txtLoadedRatio").value = loadedRatio;
				var currentTime = playingVideoSite.get_currentTime();
			
				if (currentTime) {
					document.getElementById("txtCurrentTime").value = currentTime;
					document.getElementById("btnUpdateProgress").click();
				}
			}
		}
		
		setTimeout(that.checkPeriodically, waitTime);
	};
	
	that.play = function () {
		playingVideoSite.play();
	};
	
	that.pause = function () {
		playingVideoSite.pause();
	};
	
	that.load = function () {
		that.isLoaded = false;
		playingVideoSite.load(videoId);
	};
	
	that.changeVolume = function() {
		var volume = Number(document.getElementById("txtVolume").value);
		playingVideoSite.changeVolume(volume);
	};
	
	that.mute = function() {
		playingVideoSite.mute();
	};
	
	that.unmute = function() {
		playingVideoSite.unmute();
	};
	
	that.seekTo = function() {
		var seekValue = Number(document.getElementById("txtSeekValue").value);
		playingVideoSite.seekTo(seekValue);
	};
	
	that.setYTPlayer = function(ytplayer) {
		youtube.setPlayer(ytplayer);
	};
	
	that.stopCheckingPeriodically = function() {
		stopCheckingPeriodically = true;
	};
	
	that.onResize = function() {
		if (playingVideoSite) {
			playingVideoSite.changeSize(document.documentElement.clientWidth, document.documentElement.clientHeight);
		}
	};
	
	return that;
};

