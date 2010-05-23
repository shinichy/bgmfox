////////////////////////////////////////////////////////////////////////////////////////////////////
// 
// Constants
// 
////////////////////////////////////////////////////////////////////////////////////////////////////
const Cc = Components.classes;
const Ci = Components.interfaces;
const playlistFileName = "bgmfox.rdf";
const regExprNicoVideoId = /^(\w\w\d+)$|^(\d+)$/;
const loginHostName = "https://secure.nicovideo.jp";

////////////////////////////////////////////////////////////////////////////////////////////////////
// 
// global variables
// 
////////////////////////////////////////////////////////////////////////////////////////////////////
var videoManager;
var playlistsManager;
var rdfManager;
var gridView;
var currentPlaylistManager;
var console = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
var enumRepeatValues = {noRepeat: 0, oneRepeat: 1, allRepeat: 2};
var enumTabValues = {bgmfoxPlaylist: 0, nicoSearchResult: 1, ytSearchResult: 2, mylist: 3};
var enumSortValues = {registerdAscending: 0, titleAscending: 4, titleDescending: 5, addedDateAscending: 7, addedDateDescending: 6, viewCountAscending: 9, viewCountDescending: 8, mylistCountAscending: 15, mylistCountDescending: 14, durationAscending: 17, durationDescending: 16};
var stsbrMessageQueueCount = 0;
var queryCount = 0;
var dsource;
var scrollingVideoTitle;
var prefSvc = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
var dirService = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
                                             Components.interfaces.nsILoginInfo,
                                             "init");
var prefBranch = prefSvc.getBranch("extensions.bgmfox.");
var lastSelectedTabIndex = -1;
var loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
var mainWindow = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIWebNavigation).QueryInterface(Components.interfaces.nsIDocShellTreeItem).rootTreeItem.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIDOMWindow);
var onTabSelectedEventCount = 0;

///////////////////////////////////////////////////////////////////////////////////
//
// global functions
//
///////////////////////////////////////////////////////////////////////////////////


function sendLoginQuery(mail, password) {
    log("send login query");
    $.ajax({async: false, type:"POST", url: "https://secure.nicovideo.jp/secure/login?site=niconico", data:{mail: mail, password: password, next_url: ""},
	    complete: function(XMLHttpRequest,status){
		return true;
	    },
	    error: function(XMLHttpRequest, textStatus, errorThrown) {
		alert("error occured in sendLoginQuery.");
		return false;
	    }
	   });
}

function isPlaylistFocused() {
    return document.getElementById("tbbxMainList").selectedIndex == 0; 
}

function openOriginalSite() {
    let contents;
    let selectedVideoId;

    switch(document.getElementById("tbbxMainList").selectedIndex) {
    case 0:
	contents = document.getElementById("trPlaylistContents");
	if (contents.view) {
	    selectedVideoId = contents.view.getItemAtIndex(contents.currentIndex).getAttribute("value");
	} else {
	    selectedVideoId = gridView.get_selectedVideoId();
	}
	break;
    case 1:
    case 2:
	selectedVideoId = videoManager.selectedItem.value;
	break;
	// my list
    case 3:
	contents = document.getElementById("trMylistContents");
	if (contents.view) {
	    selectedVideoId = JSON.parse(contents.view.getItemAtIndex(contents.currentIndex).getAttribute("value")).video_id;
	} else {
	    selectedVideoId = gridView.get_selectedVideoId();
	}

	break;
    }

    if (isNicoVideoId(selectedVideoId)) {
	mainWindow.getBrowser().addTab("http://www.nicovideo.jp/watch/" + selectedVideoId);
    } else {
	mainWindow.getBrowser().addTab("http://www.youtube.com/watch?v=" + selectedVideoId);
    }
}

function getToken() {
    var browser = document.getElementById("nicoBrowser2");
    browser.addEventListener("load", setToken, true);
    browser.loadURI('http://www.nicovideo.jp/my/mylist');
}

function setToken() {
    var browser = document.getElementById("nicoBrowser2");
    let html = browser.contentDocument.documentElement.innerHTML

    var regExpr = /NicoAPI.token = "([^"]*)"/;
    var rObj = new RegExp(regExpr);

    if (html.match(rObj)) {
	mylistManager.token = RegExp.$1;
    }

    browser.removeEventListener("load", setToken, true);
}

function onLoad() {
    playlistsManager = createPlaylistsManager();
    rdfManager = createRdfManager();
    document.getElementById("rlbPlaylists").builder.addListener(rdfManager.get_playlistListener());
    document.getElementById("trPlaylistContents").builder.addListener(rdfManager.get_playlistContentListener());
    var embeddedDocument = document.getElementById("nicoBrowser").contentDocument;
    var youtube = new Youtube(embeddedDocument);
    var niconico = new Niconico(embeddedDocument);
    videoManager = new VideoManager({ youtube: youtube, niconico: niconico });
    videoManager.init();
    mylistManager.init();
    embeddedDocument.getElementById("btnOnPlayerStateChange").addEventListener("click", onPlayerStateChange, false);
    embeddedDocument.getElementById("btnUpdateProgress").addEventListener("click", onUpdateProgress, false);
    rdfManager.loadDataSource(playlistsManager.loadedFunc);
    ContextPlaylist.init();
    scrollingVideoTitle = newScrollingVideoTitle();

    var selectedIndex = document.getElementById("tbplsMainList").selectedIndex;
    if (selectedIndex == enumTabValues.mylist) {
	gridView = mylistManager.gridView;
	currentPlaylistManager = mylistManager;
	mylistManager.loadMylists();
    } else {
	gridView = playlistsManager.gridView;
	currentPlaylistManager = playlistsManager;
    }
}

function isNicoVideoId(videoId) {
    return videoId.match(regExprNicoVideoId);
}

function getVideoInfo(videoId, callback) {
    if (!videoId) {
	throw "invalid videoId.";
    }

    var videoInfo = {title: "", videoId: videoId, thumbnail_url: "", published: "", duration: "", viewCount: "", favoriteCount: ""};
    if (isNicoVideoId(videoId)) {
	$.get("http://ext.nicovideo.jp/api/getthumbinfo/" + videoId, function(xml) {
		  videoInfo.title = $(xml).find("title").text();
		  videoInfo.thumbnail_url = $(xml).find("thumbnail_url").text();
		  var text = $(xml).find("first_retrieve").text();
		  var unnecessaryStr = text.match(/\+\d\d:\d\d/);
		  let published = text.replace(/-/g, "/").replace("T", " ").replace(unnecessaryStr, "");
		  videoInfo.published = (new Date(published)).getTime() * 1000;
		  let duration = $(xml).find("length").text();
		  if (duration.match(/^\d:\d\d$/)) {
		      duration = "00" + duration;
		  } else if (duration.match(/^\d\d:\d\d$/)) {
		      duration = "0" + duration;
		  }

		  videoInfo.duration = duration;
		  videoInfo.viewCount = $(xml).find("view_counter").text();
		  videoInfo.favoriteCount = $(xml).find("mylist_counter").text();
		  callback(videoInfo);
	      });
    } else {
	$.getJSON('http://gdata.youtube.com/feeds/api/videos/{videoId}?alt=json'.replace("{videoId}", videoId), function(json_response) {
		  let json = json_response;
		  videoInfo.title = json.entry.title.$t;
		  videoInfo.thumbnail_url = json.entry.media$group.media$thumbnail[0].url;
		  let text = json.entry.published.$t;
		  let unnecessaryStr = text.match(/\..*$/);
		  let published = text.replace(/-/g, "/").replace("T", " ").replace(unnecessaryStr, "");
		  videoInfo.published = (new Date(published)).getTime() * 1000;
		  let duration = secondsToStr(json.entry.media$group.yt$duration.seconds);
		  if (duration.match(/^\d:\d\d$/)) {
		      duration = "00" + duration;
		  } else if (duration.match(/^\d\d:\d\d$/)) {
		      duration = "0" + duration;
		  }

		  videoInfo.duration = duration;
		  if (json.entry.yt$statistics) {
		      videoInfo.viewCount = json.entry.yt$statistics.viewCount;
		      videoInfo.favoriteCount = json.entry.yt$statistics.favoriteCount;
		  }

		  callback(videoInfo);
	      });
    }
}

function onTabSelected(event) {
    if (event.target.tagName !== "tabpanels") {
	return;
    }

    if (onTabSelectedEventCount > 0) {
	return;
    }

    onTabSelectedEventCount += 1;
    log("tab selected");
    var selectedIndex = document.getElementById("tbplsMainList").selectedIndex;

    if (playlistsManager && mylistManager) {
	if (selectedIndex == enumTabValues.mylist) {
	    gridView = mylistManager.gridView;
	    currentPlaylistManager = mylistManager;
	    if (selectedIndex !== lastSelectedTabIndex) {
		mylistManager.loadMylists();
	    }
	} else {
	    gridView = playlistsManager.gridView;
	    currentPlaylistManager = playlistsManager;
	}
    }

    lastSelectedTabIndex = selectedIndex;
    setTimeout(function(){
		   onTabSelectedEventCount -= 1;
	       }, 300);
}

function onSettingsPressed() {
    window.open("chrome://bgmfox/content/prefs.xul", "Login", "chrome,modal,centerscreen");
}

function playOrPause() {
    if (document.getElementById("imgPlay").style.display === "block") {
	videoManager.playVideo();
    } else {
	videoManager.pauseVideo();
    }
}

function onPlayerStateChange(event) {
    videoManager.onPlayerStateChange.apply(videoManager, arguments);
}

function onUpdateProgress(event) {
    videoManager.onUpdateProgress.apply(videoManager, arguments);
}

function onMuteMouseOver(event) {
    document.getElementById("popupVolume").openPopup(event.target, "after_start", 0, 0, false);
}

function onPopupVolumeMouseOut(event) {
    var mx = event.clientX;
    var my = event.clientY;
    var px = event.currentTarget.boxObject.x;
    var py = event.currentTarget.boxObject.y;
    var pw = event.currentTarget.boxObject.width;
    var ph = event.currentTarget.boxObject.height;
    var margin = 5;

    if (px < mx && mx < px + pw - margin && py - 5 <= my && my < py + ph - margin) {
	return;
    }

    document.getElementById("popupVolume").hidePopup();
}

function onImgMuteMouseOut(event) {
    if ((event.target.boxObject.y + event.target.boxObject.height) > event.clientY) {
	document.getElementById("popupVolume").hidePopup();
    }
}

function onSearchResultDblClicked(event) {
    var selectedVideoId = event.currentTarget.selectedItem.value;
    if (selectedVideoId) {
	getVideoInfo(selectedVideoId, function(videoInfo) {
			 let video = newVideo(videoInfo.title, selectedVideoId, videoInfo.thumbnail_url, videoInfo.duration, videoInfo.published, videoInfo.viewCount, videoInfo.favoriteCount);
			 videoManager.set_currentPlaylist(null);
			 videoManager.loadVideo(video);
		     }
		    );
    }
}

function onMarqueeClick(event) {
    event.target.stop();
}

function onMarqueeDblClick(event) {
    event.target.start();
}

function onLblTimeClick(event) {
    if (event.target.id === "lblTotalTime") {
	document.getElementById("lblTotalTime").style.display = "none";
	document.getElementById("lblRemainingTime").style.display = "block";
    } else if (event.target.id === "lblRemainingTime") {
	document.getElementById("lblTotalTime").style.display = "block";
	document.getElementById("lblRemainingTime").style.display = "none";
    }
}


/**
 * Enterで検索開始したいけど、変換中のEnterでも検索してしまう...
 */
function onKeyup(event) {
//     if (event.keyCode == event.DOM_VK_RETURN || event.keyCode == event.DOM_VK_ENTER) {
// 	videoManager.searchVideo();
//     }
}

function createHttpRequest(){
    if(window.XMLHttpRequest) {
  	return new XMLHttpRequest();
    }
    else {
  	return null;
    }
}

function exportLibrary() {
    var nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, "Select a Folder", nsIFilePicker.modeGetFolder);
    var res = fp.show();
    if (res == nsIFilePicker.returnOK){
	var destFile = fp.file.clone();
	destFile.append(playlistFileName);
	log(destFile.path);

	var playlistsFile = dirService.get("ProfD", Components.interfaces.nsIFile);
	playlistsFile.append(playlistFileName);
	if (playlistsFile.exists()) {
	    if (destFile.exists()) {
		destFile.remove(false);
	    }
	    
	    log(fp.file.path);
	    playlistsFile.copyTo(fp.file, ""); //fp.file is nsIFile which points to destination directory.
	    prompts.alert(null, "", "Export succeeded.");
	}
    }
}

//////////////////////////////////////////////////////////////////
//
//Utilities
//
//////////////////////////////////////////////////////////////////

function joinItemIds(itemIds) {
    return _joinIds(itemIds, "id_list%5B0%5D%5B%5D=")
}

function joinGroupIds(groupIds) {
    return _joinIds(groupIds, "group_id_list%5B%5D=")
}

function _joinIds(ids, str) {
    var result = "";
    for (i in ids) {
	result += str + ids[i] + "&";
    }

    result = result.substring(0, result.length - 1);
    log(result);
    return result;
}

function secondsToStr(seconds) {
    let minutes = Math.floor(seconds / 60);
    let seconds = Math.floor(seconds % 60);
    if (seconds < 10) {
	seconds = "0" + seconds;
    }

    return minutes + ":" + seconds;
}

function strToSeconds(string) {
    var minutes;
    var seconds;
    var regExpr = /(\d+):(\d+)/;
    var rObj = new RegExp(regExpr);

    if (string && string.match(rObj)) {
	minutes = Number(RegExp.$1);
	seconds = Number(RegExp.$2);
	return minutes * 60 + seconds;
    } else {
	return "00:00"
    }
}

function writeStatusbar(message) {
    var lblStatusbar = document.getElementById("lblStatusbar");
    lblStatusbar.value = message;
    stsbrMessageQueueCount++;

    setTimeout(function() {
		   stsbrMessageQueueCount--;
		   if (stsbrMessageQueueCount === 0) {
		       lblStatusbar.value = "";
		   }
	       }, 3000);
}

function log(aText) {
    console.logStringMessage(aText);
}

/*  VideoManager class

 */
function VideoManager(videoSites) {
    // Fields
    this.playingVideo = null;
    this.playingVideoSite = null;
    this.videoSites = videoSites;
    this.currentPlaylist = null;
    this.isPlaylistItemPlaying = null;
    this.query = null;
    this.searchResultsPerPage = 30;
    this.enumPlayerStates = {end: "0", playing: "1", paused: "2", buffering: "3", load: "5", needLogin: "-100"};
    this.repeatValue = enumRepeatValues.noRepeat;
    this.waitTime = 2;
    this.seekingCount = 0;
    this.updatingCount = 0;
    this.isStopped = true;
    this.forceLogin = false;
    const markStyle = "font-weight: bold; color: blue;"

    // Methods

    this.init = function() {
	this.checkPrevNextVideo();
	this.checkRepeatState();
    };

    this.playVideo = function() {
	if (this.playingVideoSite === null) {
	    return;
	}

	this.playingVideoSite.play();
    };

    this.pauseVideo = function() {
	if (this.playingVideoSite === null) {
	    return;
	}

	this.playingVideoSite.pause();
    };

    this.loadVideo = function(video) {
	queryCount++;
	try {
	    if (queryCount > 1) {
		writeStatusbar("Wait for {waitTime} seconds for reducing the network load.".replace("{waitTime}", this.waitTime));
		return;
	    }

	    if (!video) {
		if (!this.playingVideo) {
		    setTimeout(function() {queryCount--;}, this.waitTime * 1000);
		    throw "no video";
		}

		video = this.playingVideo;
	    } else {
		this.playingVideo = video;
	    }

	    if (isNicoVideoId(video.get_id())) {
		this.playingVideoSite = this.videoSites.niconico;
	    }
	    else {
		this.playingVideoSite = this.videoSites.youtube;
	    }

	    this.resetProgressState();
	    this.checkPrevNextVideo();
	    this.markPlayingVideo();
	    document.getElementById("lblVideoTitle").value = video.get_title();
	    document.getElementById("lblTotalTime").value = secondsToStr(this.playingVideo.get_duration_seconds());
	    this.playingVideoSite.load(video.get_id());
	} finally {
	    setTimeout(function() {queryCount--;}, this.waitTime * 1000);
	}
    };

    this.changeVolume = function(event) {
	if (this.playingVideoSite === null) {
	    return;
	}

	this.playingVideoSite.changeVolume(event.target.value);
    };

    this.seekTo = function(event) {
	if (this.playingVideoSite === null) {
	    return;
	} else if (this.noSeek) {
	    this.noSeek = false;
	    return;
	}

	this.seekingCount++;
	this.playingVideoSite.seekTo(event.target.value * document.getElementById("sclProgress").width / document.getElementById("bxProgress").boxObject.width);
	let lblCurrentTime = document.getElementById("lblCurrentTime");
	let currentTime = strToSeconds(lblCurrentTime.value);
	let timeAfterSeek = event.target.value / 100 * document.getElementById("sclProgress").width / document.getElementById("bxProgress").boxObject.width * this.playingVideo.get_duration_seconds();
	let currentTimeStr = secondsToStr(timeAfterSeek);
	lblCurrentTime.value = currentTimeStr;
	document.getElementById("lblRemainingTime").value = "-" + secondsToStr(this.playingVideo.get_duration_seconds() - timeAfterSeek);
	setTimeout(function(vm) {vm.seekingCount--;}, 1000, this);
    };

    this.mute = function() {
	if (this.playingVideoSite === null) {
	    return;
	}

	this.playingVideoSite.mute();
	document.getElementById("imgMute").style.display = "none";
	document.getElementById("imgUnmute").style.display = "block";
    };

    this.unmute = function() {
	if (this.playingVideoSite === null) {
	    return;
	}

	this.playingVideoSite.unmute();
	document.getElementById("imgMute").style.display = "block";
	document.getElementById("imgUnmute").style.display = "none";
    };

    this._recreatePlaylist = function() {
	if (!this.currentPlaylist.isMylist) {
	    var playlists = document.getElementById("rlbPlaylists");
	    for (var i = 0; i < playlists.itemCount; i++) {
		if (playlists.getItemAtIndex(i).firstChild.value == this.currentPlaylist.get_name()) {
		    playlistsManager.onPlaylistSelectionChanged({currentTarget: playlists});
		    this.set_currentPlaylist(playlistsManager.get_selectedPlaylist());
		    break;
		}
	    }
	} else {
	    var mylists = document.getElementById("rlbMylists");
	    for (var i = 0; i < mylists.itemCount; i++) {
		if (mylists.getItemAtIndex(i).value == this.currentPlaylist.groupId) {
		    mylistManager.onPlaylistSelectionChanged();
		    this.set_currentPlaylist(mylistManager.selectedPlaylist);
		    break;
		}
	    }
	}
    }

    this.nextVideo = function() {
	if (this.currentPlaylist === null) {
	    return;
	}

	// recreate playlist/mylist for adding new video or removing existing video
	this._recreatePlaylist();

	if (this.isPlaylistItemPlaying && this.currentPlaylist.hasNextOf(this.playingVideo)) {
	    this.loadVideo(this.currentPlaylist.getNextOf(this.playingVideo));
	}
    };

    this.previousVideo = function() {
	if (this.currentPlaylist === null) {
	    return;
	}

	// recreate playlist/mylist for adding new video or removing existing video
	this._recreatePlaylist();


	if (this.isPlaylistItemPlaying && this.currentPlaylist.hasPreviousOf(this.playingVideo)) {
	    this.loadVideo(this.currentPlaylist.getPreviousOf(this.playingVideo));
	}
    };

    this.checkPrevNextVideo = function() {
	if (!this.currentPlaylist) {
	    document.getElementById("imgNext").style.display = "none";
	    document.getElementById("imgNext_disabled").style.display = "block";
	    document.getElementById("cmd_playNext").disabled = true;
	    document.getElementById("imgPrevious").style.display = "none";
	    document.getElementById("imgPrevious_disabled").style.display = "block";
	    document.getElementById("cmd_playPrevious").disabled = true;
	    return;
	}

	if (this.currentPlaylist.hasNextOf(this.playingVideo)) {
	    document.getElementById("imgNext").style.display = "block";
	    document.getElementById("imgNext_disabled").style.display = "none";
	    document.getElementById("cmd_playNext").disabled = false;
	} else {
	    document.getElementById("imgNext").style.display = "none";
	    document.getElementById("imgNext_disabled").style.display = "block";
	    document.getElementById("cmd_playNext").disabled = true;
	}

	if (this.currentPlaylist.hasPreviousOf(this.playingVideo)) {
	    document.getElementById("imgPrevious").style.display = "block";
	    document.getElementById("imgPrevious_disabled").style.display = "none";
	    document.getElementById("cmd_playPrevious").disabled = false;
	} else {
	    document.getElementById("imgPrevious").style.display = "none";
	    document.getElementById("imgPrevious_disabled").style.display = "block";
	    document.getElementById("cmd_playPrevious").disabled = true;
	}
    };

    this.checkRepeatState = function() {
	if (document.getElementById("imgAllRepeat").style.display === "block") {
	    this.repeatValue = enumRepeatValues.allRepeat;
	} else if (document.getElementById("imgOneRepeat").style.display === "block") {
	    this.repeatValue = enumRepeatValues.oneRepeat;
	} else {
	    this.repeatValue = enumRepeatValues.noRepeat;
	}
    };

    this.isShuffleOn = function() {
	if (document.getElementById("imgShuffleOn").style.display === "block") {
	    return true;
	} else {
	    return false;
	}
    };

    this.searchVideo = function search() {
	queryCount++;
	try {
	    if (queryCount > 1) {
		writeStatusbar("Wait for {waitTime} seconds for reducing the network load.".replace("{waitTime}", this.waitTime));
		return;
	    }

	    var query = document.getElementById("txtVideoId").value;
	    formHistory = Components.classes["@mozilla.org/satchel/form-history;1"].getService(Components.interfaces.nsIFormHistory2);
	    formHistory.addEntry("searchbar-history", query);
	    this.query = query;
	    if (isNicoVideoId(query)) {
		this.loadVideo(query);
	    }
	    else {
		this.clearSearchResults(document.getElementById("rlbYoutubeSearchResult"));
		this.clearSearchResults(document.getElementById("rlbNiconicoSearchResult"));
		document.getElementById("imgYoutubeSearching").style.display = "block";
		this.videoSites.niconico.search(query);
		this.videoSites.youtube.search(query);
		let tabbox = document.getElementById("tbbxMainList");
		if (tabbox.selectedIndex != enumTabValues.nicoSearchResult || tabbox.selectedIndex != enumTabValues.ytSearchResult) {
		    tabbox.selectedIndex = enumTabValues.nicoSearchResult;
		}
	    }
	} finally {
	    setTimeout(function() {queryCount--;}, this.waitTime * 1000);
	}
    };

    this.clearSearchResults = function(richListBox) {
	while (richListBox.firstChild) {
	    richListBox.removeChild(richListBox.firstChild);
	}
    };

    this.onPlayerStateChange = function() {
	var stateValue = document.getElementById("nicoBrowser").contentDocument.getElementById("txtStateChangeValue").value;
	switch(stateValue) {
	case this.enumPlayerStates.end:
	    log("end");
	    this.isStopped = true;
	    this.nextVideo();
	    break;
	case this.enumPlayerStates.playing:
	    log("playing");
	    document.getElementById("imgPlay").style.display = "none";
	    document.getElementById("imgPause").style.display = "block";
	    document.getElementById("imgBuffering").style.visibility = "hidden";
	    break;
	case this.enumPlayerStates.paused:
	    log("paused");
	    document.getElementById("imgPlay").style.display = "block";
	    document.getElementById("imgPause").style.display = "none";
	    break;
	case this.enumPlayerStates.buffering:
	    log("buffering");
	    document.getElementById("imgBuffering").style.visibility = "visible";
	    break;
	case this.enumPlayerStates.load:
	    log('load');
	    document.getElementById("imgPlay").style.display = "none";
	    document.getElementById("imgPause").style.display = "block";
	    document.getElementById("imgBuffering").style.visibility = "hidden";
	    this.playingVideoSite.changeVolume(document.getElementById("sclVolume").value);
	    this.forceLogin = false;
	    document.getElementById("nicoBrowser").contentDocument.getElementById("btnScrollToBottom").click();
	    videoManager.isStopped = false;
	    queryCount = 0;
	    if (videoManager.isPlaylistItemPlaying && !videoManager.currentPlaylist.isMylist) {
		setTimeout(function() {playlistsManager.updateVideoInfo(videoManager.playingVideo.get_id());}, 5000);
	    }

	    break;
	case this.enumPlayerStates.needLogin:
	    if (!this.forceLogin) {
		this.forceLogin = true;
		this.login(true);
		log("force login");
		videoManager.loadVideo();
	    }

	    break;
	default:
	    throw "invalid player state.";
	}
    };

    this.onUpdateProgress = function() {
	if (this.isStopped) {
	    return;
	}

	var loadedRatio = document.getElementById("nicoBrowser").contentDocument.getElementById("txtLoadedRatio").value;
	let sclProgress = document.getElementById("sclProgress");
	sclProgress.width = loadedRatio * 100;

	var currentTime = document.getElementById("nicoBrowser").contentDocument.getElementById("txtCurrentTime").value;

	this.updatingCount++;
	document.getElementById("lblCurrentTime").value = secondsToStr(currentTime);
	document.getElementById("lblRemainingTime").value = "-" + secondsToStr(this.playingVideo.get_duration_seconds() - currentTime);

	if (this.seekingCount === 0 && this.updatingCount > 1) {
	    this.updatingCount = 0
	    this.noSeek = true;
	    sclProgress.value = 100 * currentTime / this.playingVideo.get_duration_seconds() * document.getElementById("bxProgress").boxObject.width / sclProgress.width;
	} else {
	    this.noSeek = false;
	}
    };

    this.onRepeatClicked = function(event) {
	switch (this.repeatValue) {
	case enumRepeatValues.noRepeat:
	    this.repeatValue = enumRepeatValues.allRepeat;
	    document.getElementById("imgNoRepeat").style.display = "none";
	    document.getElementById("imgAllRepeat").style.display = "block";
	    document.getElementById("imgOneRepeat").style.display = "none";
	    break;
	case enumRepeatValues.allRepeat:
	    this.repeatValue = enumRepeatValues.oneRepeat;
	    document.getElementById("imgNoRepeat").style.display = "none";
	    document.getElementById("imgAllRepeat").style.display = "none";
	    document.getElementById("imgOneRepeat").style.display = "block";
	    break;
	case enumRepeatValues.oneRepeat:
	    this.repeatValue = enumRepeatValues.noRepeat;
	    document.getElementById("imgNoRepeat").style.display = "block";
	    document.getElementById("imgAllRepeat").style.display = "none";
	    document.getElementById("imgOneRepeat").style.display = "none";
	    break;
	default:
	    throw "invalid repeat value";
	}

	this.checkPrevNextVideo();
    };

    this.onShuffleClicked = function(event) {
	if (document.getElementById("imgShuffleOff").style.display !== "none") {
	    document.getElementById("imgShuffleOff").style.display = "none";
	    document.getElementById("imgShuffleOn").style.display = "block";
	} else {
	    document.getElementById("imgShuffleOff").style.display = "block";
	    document.getElementById("imgShuffleOn").style.display = "none";
	}
    };

    this.get_currentPlaylist = function() {
	return this.currentPlaylist;
    };

    this.set_currentPlaylist = function(playlist) {
	this.currentPlaylist = playlist;
    };

    this.set_isPlaylistItemPlaying = function(bool) {
	this.isPlaylistItemPlaying = bool;
    };

    /**
     * Log in
     * @param force Force to log in
     */
    this.login = function(force) {
	force = force || false;
	return this.videoSites.niconico.login(force);
    };

    this.previousNicoSearchResult = function() {
	document.getElementById("imgNiconicoSearching").style.display = "block";
	this.clearSearchResults(document.getElementById("rlbNiconicoSearchResult"));
	this.videoSites.niconico.previousSearchResult(this.query);
    };

    this.previousYTSearchResult = function() {
	document.getElementById("imgYoutubeSearching").style.display = "block";
	this.clearSearchResults(document.getElementById("rlbYoutubeSearchResult"));
	this.videoSites.youtube.previousSearchResult(this.query);
    };

    this.resetProgressState = function() {
	this.seekingCount = 0;
	this.updatingCount = 0;
	var sclProgress = document.getElementById("sclProgress");
	sclProgress.value = 0;
	sclProgress.width = 0;
	document.getElementById("lblCurrentTime").value = "0:00";
	document.getElementById("lblRemainingTime").value = "-0:00";
	document.getElementById("lblTotalTime").value = "0:00";
    };

    this.nextNicoSearchResult = function() {
	document.getElementById("imgNiconicoSearching").style.display = "block";
	this.clearSearchResults(document.getElementById("rlbNiconicoSearchResult"));
	this.videoSites.niconico.nextSearchResult(this.query);
    };

    this.nextYTSearchResult = function() {
	document.getElementById("imgYoutubeSearching").style.display = "block";
	this.clearSearchResults(document.getElementById("rlbYoutubeSearchResult"));
	this.videoSites.youtube.nextSearchResult(this.query);
    };

    this.markPlayingVideo = function() {
	if (this.playingVideo === null) {
	    return;
	}

	// search result video playing
	if (this.currentPlaylist === null) {
	    this.clearMarkAtTreeItem(document.getElementById("trPlaylistContents"));
	    this.clearMarkAtGridViewItem(document.getElementById("bxGridView"));
	    this.markSearchResultItem(document.getElementById("rlbNiconicoSearchResult"));
	    this.markSearchResultItem(document.getElementById("rlbYoutubeSearchResult"));
	    return;
	}

	// playlist video playing
	this.clearMarkAtSearchResultItem(document.getElementById("rlbNiconicoSearchResult"));
	this.clearMarkAtSearchResultItem(document.getElementById("rlbYoutubeSearchResult"));

	if (this.currentPlaylist.isMylist) {
	    var selectedPlaylist = document.getElementById("rlbMylists").selectedItem;
	    if (this.currentPlaylist.get_name() === selectedPlaylist.firstChild.value) {
		this.markMylistTreeItem(document.getElementById("trMylistContents"));
		this.markMylistGridViewItem(document.getElementById("bxMylistGridView"));
	    }
	} else {
	    var selectedPlaylist = document.getElementById("rlbPlaylists").selectedItem;
	    if (this.currentPlaylist.get_name() === selectedPlaylist.firstChild.value) {
		this.markTreeItem(document.getElementById("trPlaylistContents"));
		this.markGridViewItem(document.getElementById("bxGridView"));
	    }
	}
    };

    this.markSearchResultItem = function(richListBox) {
	for (var i = 0; i < richListBox.itemCount; i++) {
	    if (richListBox.getItemAtIndex(i).value === this.playingVideo.get_id()) {
		richListBox.getItemAtIndex(i).firstChild.setAttribute("style", markStyle);
	    } else {
		richListBox.getItemAtIndex(i).firstChild.setAttribute("style", "");
	    }
	}
    };

    this.markGridViewItem = function(box) {
	for (let i = 0; i < playlistsManager.gridView.get_itemCount(); i++) {
	    if (playlistsManager.gridView.get_videoIdAtIndex(i) === this.playingVideo.get_id()) {
		playlistsManager.gridView.set_styleToTitleAtIndex(i, markStyle);
	    } else {
		playlistsManager.gridView.set_styleToTitleAtIndex(i, "");
	    }
	}
    };

    this.markMylistGridViewItem = function(box) {
	for (let i = 0; i < mylistManager.gridView.get_itemCountForMylist(); i++) {
	    if (mylistManager.gridView.get_videoIdAtIndexForMylist(i) === this.playingVideo.get_id()) {
		mylistManager.gridView.set_styleToTitleAtIndexForMylist(i, markStyle);
	    } else {
		mylistManager.gridView.set_styleToTitleAtIndexForMylist(i, "");
	    }
	}
    };

    this.clearMarkAtSearchResultItem = function(richListBox) {
	for (var i = 0; i < richListBox.itemCount; i++) {
	    if (richListBox.getItemAtIndex(i).firstChild) {
		richListBox.getItemAtIndex(i).firstChild.setAttribute("style", "");
	    }
	}
    };

    this.clearMarkAtGridViewItem = function(box) {
	for (let i = 0; i < gridView.get_itemCount(); i++) {
	    gridView.set_styleToTitleAtIndex(i, "");
	}
    };

    this.markTreeItem = function(tree) {
	if (tree.view === null) {
	    return;
	}

	for (var i = 0; i < tree.view.rowCount; i++) {
	    if (tree.view.getItemAtIndex(i).getAttribute("value") === this.playingVideo.get_id()) {
		tree.view.getItemAtIndex(i).firstChild.firstChild.setAttribute("properties", "playing");
	    } else {
		tree.view.getItemAtIndex(i).firstChild.firstChild.setAttribute("properties", "");
	    }
	}
    };

    this.markMylistTreeItem = function(tree) {
	if (tree.view === null) {
	    return;
	}

	for (var i = 0; i < tree.view.rowCount; i++) {
	    if (JSON.parse(tree.view.getItemAtIndex(i).getAttribute("value")).video_id === this.playingVideo.get_id()) {
		tree.view.getItemAtIndex(i).firstChild.firstChild.setAttribute("properties", "playing");
	    } else {
		tree.view.getItemAtIndex(i).firstChild.firstChild.setAttribute("properties", "");
	    }
	}
    };

    this.clearMarkAtTreeItem = function(tree) {
	if (tree.view) {
	    for (var i = 0; i < tree.view.rowCount; i++) {
		tree.view.getItemAtIndex(i).firstChild.firstChild.setAttribute("properties", "");
	    }
	}
    };
}

function VideoSite(htmlDocument) {
    this.initialize.apply(this, arguments);
}

VideoSite.prototype = {
    videoId: "",
    htmlDocument: "",

    initialize: function(htmlDocument) {
	this.htmlDocument = htmlDocument;
    },

    play: function() {
	this.htmlDocument.getElementById("btnPlay").click();
    },

    load: function(videoId) {
	this.htmlDocument.getElementById("txtVideoId").value = videoId;
	setTimeout(function (htmlDocument) {htmlDocument.getElementById("btnChangeVideoSite").click();}, 100, this.htmlDocument);
    },

    pause: function() {
	this.htmlDocument.getElementById("btnPause").click();
    },

    changeVolume: function(volume) {
	this.htmlDocument.getElementById("txtVolume").value = volume;
	this.htmlDocument.getElementById("btnChangeVolume").click();
    },

    seekTo: function(value) {
	var seekValue = value * document.getElementById("sclProgress").width / document.getElementById("sclProgress").width / 100 * videoManager.playingVideo.get_duration_seconds();
	this.htmlDocument.getElementById("txtSeekValue").value = seekValue;
	this.htmlDocument.getElementById("btnSeekTo").click();
    },

    mute: function() {
	this.htmlDocument.getElementById("btnMute").click();
    },

    unmute: function() {
	this.htmlDocument.getElementById("btnUnmute").click();
    },

    setSize: function() {
	this.htmlDocument.getElementById("btnSetSize").click();
    }
};

function Youtube(htmlDocument) {
    this.initialize.apply(this, arguments);
}

/*  Youtube class

 */
function YoutubeProto() {
    this.SearchUri = 'http://gdata.youtube.com/feeds/api/videos?vq={query}&orderby={orderby}&start-index={start-index}&max-results={max-results}&alt=json';
    this.page = 1;

    this.search = function(query, page) {
	if (page == undefined) {
	    page = 1;
	}

	var url = this.SearchUri.replace("{query}", query);
	url = url.replace("{max-results}", videoManager.searchResultsPerPage);
	url = url.replace("{start-index}", (page - 1) * videoManager.searchResultsPerPage + 1);
	url = url.replace("{orderby}", document.getElementById("mnlSort").selectedItem.value);
	if (page == 1) {
	    document.getElementById("btnPrvYTSrchRlt").disabled = true;
	} else if (this.page < 1) {
	    throw "the page number is invalid.";
	} else {
	    document.getElementById("btnPrvYTSrchRlt").disabled = false;
	}

	this.requestFile('GET', url , true);
    };

    this.previousSearchResult = function(query) {
	this.page--;
	this.search(query, this.page);
    };

    this.nextSearchResult = function(query) {
	this.page++;
	this.search(query, this.page);
    };

    this.requestFile = function(method , fileName , async ) {
	var httpoj = createHttpRequest();
	var context = this;
	httpoj.open(method, fileName, async);
	httpoj.onreadystatechange = function() {
	    if (httpoj.readyState==4) {
		var JSON_response = httpoj.responseText;
		var myObj = JSON.parse(JSON_response);
		context.listVideos(myObj);
	    }
	};

	httpoj.send(null);
    };

    this.listVideos = function(data) {
	var totalResults = data.feed.openSearch$totalResults.$t;
	if (this.page * videoManager.searchResultsPerPage > totalResults) {
	    document.getElementById("btnNxtYTSrchRlt").disabled = true;
	} else {
	    document.getElementById("btnNxtYTSrchRlt").disabled = false;
	}

	var rlbYoutubeSearchResult = document.getElementById("rlbYoutubeSearchResult");
	if(totalResults > 0){
	    var entries = data.feed.entry;
	    for(var i=0;i<entries.length;i++) {
		var videoId = entries[i].id.$t;
		var regExpr = "/([^\/]*)$";
		rObj = new RegExp(regExpr);
		if (videoId.match(rObj)) {
		    videoId = RegExp.$1;
		}
		else {
		    log("Youtube videoId parse error");
		}
		rlbYoutubeSearchResult.appendItem(entries[i].title.$t, videoId);
	    }
	    videoManager.markPlayingVideo();
	}

	document.getElementById("imgYoutubeSearching").style.display = "none";
    };
}
YoutubeProto.prototype = new VideoSite();
Youtube.prototype = new YoutubeProto();

function Niconico(htmlDocument) {
    this.initialize.apply(this, arguments);
}

/*  Niconico class

 */
function NiconicoProto() {
    this.cookieDomain = ".nicovideo.jp";
    this.cookieName = "user_session";
    this.SearchUri = "http://www.nicovideo.jp/search/{query}?sort={sort}&page={page}";
    this.page = 1;
    this.searchTotal = -1;

    this.search = function(query, page, force) {
	var loginSuccess = this.login(force);
	if (!loginSuccess) {
	    return false;
	}

	document.getElementById("imgNiconicoSearching").style.display = "block";
	var searchUri = this.SearchUri.replace("{query}", query);

	if (page == undefined) {
	    page = 1;
	}

	if (page == 1) {
	    document.getElementById("btnPrvNicoSrchRlt").disabled = true;
	} else if (this.page < 1) {
	    throw "the page number is invalid.";
	} else {
	    document.getElementById("btnPrvNicoSrchRlt").disabled = false;
	}

	searchUri = searchUri.replace("{page}", page);

	var sort;
	switch(document.getElementById("mnlSort").value) {
	case "published":
	    sort = "";
	    break;
	case "viewCount":
	    sort = "v";
	    break;
	case "rating":
	    sort = "m";
	    break;
	default:
	    throw "invalid sort type.";
	}

	searchUri = searchUri.replace("{sort}", sort);
	var browser = document.getElementById("nicoBrowser2");
	browser.addEventListener("load", NiconicoProto.searchNicoVideo, true);
	browser.loadURI(searchUri);
    };

    this.previousSearchResult = function(query) {
	this.page--;
	this.search(query, this.page);
    };

    this.nextSearchResult = function(query) {
	this.page++;
	this.search(query, this.page);
    };

    this.load = function(videoId) {
	var loginSuccess = this.login();
	if (!loginSuccess) {
	    return false;
	}

	document.getElementById("nicoBrowser2").loadURI("http://www.nicovideo.jp/watch/" + videoId);
	NiconicoProto.prototype.load.apply(this, arguments);
    };

    var _chromeToPath = function(aPath) {
	if (!aPath || !(/^chrome:/.test(aPath)))
	    return; //not a chrome url
	var rv;

	var ios = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces["nsIIOService"]);
	var uri = ios.newURI(aPath, "UTF-8", null);
	var cr = Components.classes['@mozilla.org/chrome/chrome-registry;1'].getService(Components.interfaces["nsIChromeRegistry"]);
	rv = cr.convertChromeURL(uri).spec;

	if (/^file:/.test(rv))
	    rv = _urlToPath(rv);
	else
	    rv = _urlToPath("file://"+rv);

	return rv;
    };

    var _urlToPath = function(aPath) {
	if (!aPath || !/^file:/.test(aPath))
	    return ;
	var rv;
	var ph = Components.classes["@mozilla.org/network/protocol;1?name=file"]
	    .createInstance(Components.interfaces.nsIFileProtocolHandler);
	rv = ph.getFileFromURLSpec(aPath).path;
	return rv;
    };

    /**
     * Log in
     * @param {Boolean} force  Force to log in
     */
    this.login = function(force) {
	force = force || false;
	if (this.checkLoginAndRemoveCookie(force)) {
	    return true;
	}

	let mail = prefBranch.getCharPref("niconicoLoginMail");
	let password;


	if (loginManager.countLogins(loginHostName, "", "") > 0) {
	    let logins = loginManager.findLogins({}, loginHostName, "", "");
	    for (let i = 0; i < logins.length; i += 1) {
		if (mail == logins[i].username) {
		    password = logins[i].password;
		}
	    }
	} else {
// 	    var params = {inn: {}, out: null};
// 	    window.openDialog("chrome://bgmfox/content/prefs.xul", "Login", "chrome,modal,centerscreen", params);
// 	    if (params.out) {
// 		mail = params.out.mail;
// 		password = params.out.password;
// 	    } else {
// 		return false;
// 	    }
	    var user = { value : "" }, pass = { value : "" };
	    var ret = prompts.promptUsernameAndPassword(
		window, "Authorization", "Enter Niconico username and password.",
		user, pass, null, {}
	    );
	    if (ret) {
		mail  = user.value;
		password = pass.value;
		log(mail);
		log(password);
		if (mail.length > 0 && password.length > 0   ) {
		    // save new login info if it doesn't exist
		    let newLogin = new nsLoginInfo(loginHostName, loginHostName, null, mail, password, 'mail', 'password');
		    loginManager.addLogin(newLogin);
		    prefBranch.setCharPref("niconicoLoginMail", mail);
		}
	    } else {
		return false;
	    }
	}

	return sendLoginQuery(mail, password);
    };

    this.checkLoginAndRemoveCookie = function(force) {
	var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
	var iter = cookieManager.enumerator;
	while (iter.hasMoreElements()){
	    var cookie = iter.getNext().QueryInterface(Components.interfaces.nsICookie2);
	    if (cookie instanceof Components.interfaces.nsICookie) {
		if (cookie.host == this.cookieDomain && cookie.name == this.cookieName) {
		    var d = new Date();
		    if (!force && d.getTime() * 1000 < cookie.creationTime + 1000 * 1000 * 60 * 60) {
			return true;
		    } else {
			cookieManager.remove(this.cookieDomain, this.cookieName, "/", false);
			log("cookie removed. at " + d.toLocaleString());
			break;
		    }
		}
	    }
	}

	return false;
    };
}

NiconicoProto.searchNicoVideo = function(niconicoProto, query, page) {
    var cookieDomain = ".nicovideo.jp";
    var cookieName = "user_session";
    var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
    var rlbNiconicoSearchResult = document.getElementById("rlbNiconicoSearchResult");
    var browser = document.getElementById("nicoBrowser2");
    var domDoc = browser.contentDocument;

    if (domDoc.documentURI.indexOf("login_form") !== -1) {
	cookieManager.remove(cookieDomain, cookieName, "/", false);
	videoManager.searchVideo();
	return false;
    }

    var strongs = domDoc.getElementsByTagName("strong");
    var searchTotal;
    for (let i = 0; i < strongs.length; i++) {
	if (strongs[i].getAttribute("class") == "search_total") {
	    searchTotal = Number(strongs[i].textContent.substring(0, strongs[i].textContent.length - 1).replace(/,/g, ""));
	    break;
	}
    }

    if (videoManager.videoSites.niconico.page * videoManager.searchResultsPerPage > searchTotal) {
	document.getElementById("btnNxtNicoSrchRlt").disabled = true;
    } else {
	document.getElementById("btnNxtNicoSrchRlt").disabled = false;
    }


    for (let i = 1; i < videoManager.searchResultsPerPage + 1; i++) {
	var divItem = domDoc.getElementById("item" + i);
	if (divItem === null) {
	    break;
	}

	var paragraphs = divItem.getElementsByTagName("p");
	for (var j = 0; j < paragraphs.length; j++) {
	    if (paragraphs[j].getAttribute("class") == "font12") {
		var child = paragraphs[j].firstChild;
		var rObj = new RegExp("\/([^\/]*)$");
		child.getAttribute("href").match(rObj);
		var videoId = RegExp.$1;
		var title = child.firstChild.textContent;
		rlbNiconicoSearchResult.appendItem(title, videoId);
		break;
	    }
	}
    }

    browser.removeEventListener("load", NiconicoProto.searchNicoVideo, true);
    videoManager.markPlayingVideo();
    document.getElementById("imgNiconicoSearching").style.display = "none";
};

NiconicoProto.prototype = new VideoSite();
Niconico.prototype = new NiconicoProto();

/**
 * @class PlaylistsManager
 */
function createPlaylistsManager() {
    var that = {};
    var RDFC = '@mozilla.org/rdf/container;1';
    RDFC = Components.classes[RDFC].getService();
    RDFC = RDFC.QueryInterface(Components.interfaces.nsIRDFContainer);
    var RDFCUtils = '@mozilla.org/rdf/container-utils;1';
    RDFCUtils = Components.classes[RDFCUtils].getService();
    RDFCUtils = RDFCUtils.QueryInterface(Components.interfaces.nsIRDFContainerUtils);
    var RDF = '@mozilla.org/rdf/rdf-service;1';
    RDF = Components.classes[RDF].getService();
    RDF = RDF.QueryInterface(Components.interfaces.nsIRDFService);
    var rootUri = "http://suplik.net/bgmfox/";
    var playlistPropUri = rootUri + "playlist#";
    var videoPropUri = rootUri + "video#";
    var playlistsUri = rootUri + "playlists";
    var videosUri = rootUri + "videos";
    var baseVideoUri = rootUri + "videos/";
    var selectedPlaylist;
    var oldTarget = null;
    var oldTargetIndex = -1;
    var isBorderTop = false;
    var trPlContents = document.getElementById("trPlaylistContents");
    var bxGridView = document.getElementById("bxGridView");
    var rlbPlaylists = document.getElementById("rlbPlaylists");
    that.rlbPlaylists = rlbPlaylists;
    var isLoaded = false;
    that.isListView = false;
    that.gridView = createGridView(bxGridView);

    that.copyToNiconico = function() {
	mylistManager.createMylist(selectedPlaylist.get_name(), function(json) {
				       for (let i = 0; i < selectedPlaylist.get_length(); i += 1) {
					   let videoId = selectedPlaylist.get_itemAt(i).get_id();
					   mylistManager.addToMylist(json.id, videoId);
				       }
				   });
    }

    that.copyToMylist = function(event) {
	var videoIds = _getSelectedVideoIds();
	var groupId = event.target.value;

	for (let i = 0; i < videoIds.length; i += 1) {
	    mylistManager.addToMylist(groupId, videoIds[i]);
	}
    };

    var _getSelectedVideoIds = function () {
	var videoIds = new Array();
	let start = new Object();
	let end = new Object();
	let numRanges = trPlContents.view.selection.getRangeCount();
	if (numRanges > 0) {
	    for (var t = 0; t < numRanges; t++) {
		trPlContents.view.selection.getRangeAt(t, start, end);
		for (var v = start.value; v <= end.value; v++) {
		    let videoId = trPlContents.view.getItemAtIndex(v).getAttribute("value");
		    videoIds.push(videoId);
		}
	    }
	}

	return videoIds;
    };

    that.loadedFunc = function() {
	isLoaded = true;

	// set playlist's selected index to previous value.
	_rebuildPlaylists(
	    function() {
		let playlistSelectedIndex = prefBranch.getIntPref("playlist.index");
		rlbPlaylists.selectedIndex = playlistSelectedIndex;
	    }
	);
    };

    that.get_selectedPlaylist = function() {
	return selectedPlaylist;
    };

    that.gridViewObserver = function(event) {
	var indexes = null;
	var targetIndex = -1;

	switch(event.type) {
	case "dragstart":
	    event.dataTransfer.setData("text/videoId", gridView.get_selectedVideoId());
	    break;
	default:
	    break;
	}
    };

    /**
     *
     * @param event
     */
    that.onGridViewMouseOver = function(event) {
	var videoId = event.currentTarget.firstChild.attributes[1].value;
	var video = selectedPlaylist.get(videoId);
	if (video) {
	    document.getElementById("lblTltpPublished").value = video.get_published();
	    document.getElementById("lblTltpDuration").value = video.get_duration();
	    document.getElementById("lblTltpViews").value = video.get_viewCount();
	    document.getElementById("lblTltpFavorites").value = video.get_favoriteCount();
	    document.getElementById("lblTltpTitle").value = video.get_title();
	} else {
	    event.stopPropagation();
	    event.preventDefault();
	    return false;
	}
    };

    var _init = function() {
	if (bxGridView.getAttribute("style").indexOf("block") === -1) {
	    that.isListView = true;
	} else {
	    that.isListView = false;
	}
    };

    var initRDFC = function (containerUri) {
	var container = RDF.GetResource(containerUri);
	if (!RDFCUtils.IsContainer(dsource, container) ) {
	    throw containerUri + " is not a container";
	}

	RDFC.Init(dsource, container);
    };

    var _addPlaylist = function (playlist, index, dontRebuild) {
	let oldIndex = rlbPlaylists.selectedIndex;
	initRDFC(playlistsUri);

	var newnode = RDF.GetResource(playlistsUri + "/" + playlist.get_name());
	var labelprop = RDF.GetResource(playlistPropUri + "name");
	var newvalue=RDF.GetLiteral(playlist.get_name());

	dsource.Assert(newnode, labelprop, newvalue, true);
	if (RDFC.IndexOf(newnode) == -1) {
	    //			clearPlaylistContent();
	    if (index === undefined) {
		RDFC.AppendElement(newnode);
	    } else {
		RDFC.InsertElementAt(newnode, index + 1, true);
	    }

	    var containerResource = RDF.GetResource(playlistsUri + "/" + playlist.get_name());
	    RDFCUtils.MakeSeq(dsource, containerResource);

	    if (!dontRebuild) {
		_flushDataSource();
		_rebuildPlaylists(
		    //					function() {
		    //						rdfManager.setPlcDRFunc(
		    //							function() {
		    //								rlbPlaylists.selectedIndex = oldIndex;
		    //							}
		    //						);
		    //						rlbPlaylists.selectedIndex = 0;
		    //					}
		);
	    }

	    return true;
	} else {
	    writeStatusbar("Already exists: " + playlist.get_name());
	    return false;
	}
    };

    var _flushDataSource = function () {
	dsource.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource).Flush();
    };

    var _rebuildPlaylists = function(func) {
	var plDRFunc = function() {
	    document.getElementById("addToPlaylist-context").builder.rebuild();
	    document.getElementById("copyToPlaylist-context").builder.rebuild();
	    if (func) {
		func();
	    }
	}

	rdfManager.setPlDRFunc(plDRFunc);
	rlbPlaylists.builder.rebuild();
    };

    var _rebuildPlaylist = function(func) {
	if (rlbPlaylists.selectedItem.tagName !== "richlistitem") {
	    _rebuildPlaylists();
	    return;
	}

	if (func) {
	    rdfManager.setPlcDRFunc(func);
	}

	//		that.onPlaylistSelectionChanged();
    };

    /**
     *
     * @param title
     * @return if playlist was created successfully
     * @type Boolean
     */
    that.createPlaylist = function (title) {
	var handleEvent = function(event) {
	    event.stopPropagation();
	};
	document.getElementById("wndwBGMFox").addEventListener("keyup", handleEvent, true);
	if (!title) {
	    var params = {inn: {}, out: null};
	    window.openDialog("chrome://bgmfox/content/newPlaylistDialog.xul", "newPlaylist", "chrome,modal,centerscreen,resizable=yes", params);
	    if (params.out) {
		setTimeout(function() {
			       document.getElementById("wndwBGMFox").removeEventListener("keyup", handleEvent, true);
			   }, 1000);

		title = params.out.title;
		if (title === "") {
		    return false;
		}
	    }
	}

	var playlist = newPlaylist(title);
	return _addPlaylist(playlist);
    };

    that.changeView = function(event) {
	switch (event.target.id) {
	case "imgListView":
	    document.getElementById("imgListView").style.display = "none";
	    document.getElementById("imgGridView").style.display = "block";
	    bxGridView.setAttribute("style", "display: none");
	    trPlContents.setAttribute("style", "display: inherit");
	    that.isListView = true;
	    break;
	case "imgGridView":
	    document.getElementById("imgListView").style.display = "block";
	    document.getElementById("imgGridView").style.display = "none";
	    bxGridView.setAttribute("style", "display: block");
	    trPlContents.setAttribute("style", "display: none");
	    that.isListView = false;
	    break;
	default:
	    throw "invalid target: " + event.target.id;
	}

	videoManager.markPlayingVideo();
    };

    that.deletePlaylist = function (isRename) {
	var name = selectedPlaylist.get_name();
	if (selectedPlaylist.isMaster()) {
	    return;
	}

	let oldIndex = rlbPlaylists.selectedIndex;
	if (isRename === undefined) {
	    if (videoManager.get_currentPlaylist() !== null && videoManager.get_currentPlaylist().get_name() === name) {
		videoManager.pauseVideo();
		videoManager.set_currentPlaylist(null);
		videoManager.checkPrevNextVideo();
	    }
	}

	for (let i = 0; i < selectedPlaylist.get_length(); i++) {
	    _deleteVideo(selectedPlaylist.get_itemAt(i).get_id());
	}

	initRDFC(playlistsUri);
	var sources = RDFC.GetElements();
	while(sources.hasMoreElements()) {
	    let subject = sources.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
	    let predicate = RDF.GetResource(playlistPropUri + "name");
	    let target = dsource.GetTarget(subject, predicate, true);
	    if (target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == name) {
		var playlistNode = RDF.GetResource(playlistsUri + "/" + name);
		_removeResource(playlistNode);
		RDFC.RemoveElement(subject, true);
		break;
	    }
	}

	if (!isRename) {
	    _flushDataSource();
	    if (oldIndex >= rlbPlaylists.itemCount) {
		oldIndex = rlbPlaylists.itemCount - 1;
	    }

	    rlbPlaylists.selectedIndex = oldIndex;
	    //
	    //			_rebuildPlaylists(
	    //				function() {
	    //					if (oldIndex >= rlbPlaylists.itemCount) {
	    //						oldIndex = rlbPlaylists.itemCount - 1;
	    //					}
	    //
	    //					rlbPlaylists.selectedIndex = oldIndex;
	    //				}
	    //			);
	}
    };

    that.renamePlaylist = function() {
	var params = {inn: {}, out: null};
	window.openDialog("chrome://bgmfox/content/newPlaylistDialog.xul", "newPlaylist", "chrome,modal,centerscreen,resizable=yes", params);
	if (!params.out) {
	    return;
	}

	var name = params.out.title;
	if (name == selectedPlaylist.get_name()) {
	    return;
	}

	var playlist = newPlaylist(name);
	var oldIndex = rlbPlaylists.selectedIndex;
	if (!_addPlaylist(playlist, oldIndex, true)) {
	    return false;
	}

	for (var i = 0; i < selectedPlaylist.get_length(); i++) {
	    var video = selectedPlaylist.get_itemAt(i);
	    initRDFC(playlistsUri + "/" + name);
	    var nodeUri = baseVideoUri + video.get_videoSiteName() + "/" + video.get_id();
	    var node = RDF.GetResource(nodeUri);

	    if (RDFC.IndexOf(node) == -1) {
		RDFC.AppendElement(node);
	    } else {
		writeStatusbar("Already exists: " + video.get_title());
	    }
	}

	that.deletePlaylist(true);
	if (videoManager.get_currentPlaylist() !== null && videoManager.get_currentPlaylist().get_name() === selectedPlaylist.get_name()) {
	    videoManager.set_currentPlaylist(playlist);
	}

	_flushDataSource();
	rlbPlaylists.selectedIndex = oldIndex;
    };

    var _deleteVideo = function(videoId) {
	var seqUri;
	if (selectedPlaylist.isMaster()) {
	    seqUri = videosUri;
	} else {
	    seqUri = playlistsUri + "/" + selectedPlaylist.get_name();
	}

	initRDFC(seqUri);
	var sources = RDFC.GetElements();
	while(sources.hasMoreElements()) {
	    var subject = sources.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
	    var predicate = RDF.GetResource(videoPropUri + "id");
	    var target = dsource.GetTarget(subject, predicate, true);
	    if (target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == videoId) {
		RDFC.RemoveElement(subject, true);
		if (selectedPlaylist.isMaster()) {
		    initRDFC(playlistsUri);
		    let playlists = RDFC.GetElements();
		    while(playlists.hasMoreElements()) {
			let playlistNode = playlists.getNext().QueryInterface(Ci.nsIRDFResource)
			predicate = RDF.GetResource(playlistPropUri + "name");
			target = dsource.GetTarget(playlistNode, predicate, true);
			initRDFC(playlistsUri + "/" + target.QueryInterface(Ci.nsIRDFLiteral).Value);
			if (RDFC.IndexOf(subject) !== -1) {
			    RDFC.RemoveElement(subject, true);
			}
		    }

		    _removeResource(subject);
		}

		break;
	    }
	}
    };

    that.deleteVideos = function() {
	var oldSelectedPlIndex = rlbPlaylists.selectedIndex;
	var oldSelectedVideoIndex;
	var videoIds = new Array();

	if (playlistsManager.isListView && trPlContents.view && trPlContents.view.rowCount > 0) {
	    oldSelectedVideoIndex = trPlContents.currentIndex;
	    let start = new Object();
	    let end = new Object();
	    let numRanges = trPlContents.view.selection.getRangeCount();
	    if (numRanges > 0) {
		for (var t = 0; t < numRanges; t++){
		    trPlContents.view.selection.getRangeAt(t,start,end);
		    for (var v = start.value; v <= end.value; v++){
			videoIds.push(trPlContents.view.getItemAtIndex(v).getAttribute("value"));
		    }
		}
	    }
	} else {
	    oldSelectedVideoIndex = gridView.get_selectedIndex();
	    videoIds.push(gridView.get_selectedVideoId());
	}

	for (let i in videoIds) {
	    _deleteVideo(videoIds[i]);
	}

	_flushDataSource();
	rlbPlaylists.selectedIndex = oldSelectedPlIndex;

	if (playlistsManager.isListView && trPlContents.view) {
	    if (trPlContents.view.rowCount === 0) {
		trPlContents.view.selection.select(-1);
	    } else if (0 <= oldSelectedVideoIndex && oldSelectedVideoIndex < trPlContents.view.rowCount) {
		trPlContents.view.selection.select(oldSelectedVideoIndex);
	    } else if (oldSelectedVideoIndex >= trPlContents.view.rowCount) {
		trPlContents.view.selection.select(trPlContents.view.rowCount - 1);
	    } else {
		throw "invalid oldSelectedVideoIndex: " + oldSelectedVideoIndex + "\n" +
		    "trPlContents.view.rowCount: " + trPlContents.view.rowCount;
	    }
	} else {
	    if (oldSelectedVideoIndex === gridView.get_itemCount()) {
		gridView.set_selectedIndex(oldSelectedVideoIndex - 1);
	    } else {
		gridView.set_selectedIndex(oldSelectedVideoIndex);
	    }
	}
    };


    var _removeResource = function (node) {
	var names = dsource.ArcLabelsOut(node);
	var success = false;
	while (names.hasMoreElements()) {
	    var name = names.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
	    var value = dsource.GetTarget(node, name, true);
	    dsource.Unassert(node, name, value);
	    success = true;
	}

	return success;
    };

    /**
     *
     * @param playlistTitle the title of the playlist. if title is null, new video will be added to library.
     * @param videoId
     * @param index
     */
    that.addToPlaylist = function(playlistTitle, videoId, index) {
	var newNodeUri = baseVideoUri + newVideo().get_videoSiteName(videoId) + "/" + videoId;
	var newnode = RDF.GetResource(newNodeUri);

	getVideoInfo(videoId,
		     function(videoInfo) {
			 _writeVideoResource(newnode, index, videoInfo, playlistTitle);
		     }
		    );
    };

    /**
     *
     * @param newnode
     * @param index
     * @param videoInfo
     * @param playlistTitle the title of the playlist. if title is null, new node will be added to root(library).
     */
    var _writeVideoResource = function(newnode, index, videoInfo, playlistTitle) {
	var labelprop = RDF.GetResource(videoPropUri + "id");
	var newvalue = RDF.GetLiteral(videoInfo.videoId);
	dsource.Assert(newnode, labelprop, newvalue, true);

	labelprop = RDF.GetResource(videoPropUri + "title");
	newvalue = RDF.GetLiteral(videoInfo.title);
	dsource.Assert(newnode, labelprop, newvalue, true);

	labelprop = RDF.GetResource(videoPropUri + "thumbnail_url");
	newvalue = RDF.GetLiteral(videoInfo.thumbnail_url);
	dsource.Assert(newnode, labelprop, newvalue, true);

	labelprop = RDF.GetResource(videoPropUri + "published");
	newvalue = RDF.GetDateLiteral(videoInfo.published);
	dsource.Assert(newnode, labelprop, newvalue, true);

	labelprop = RDF.GetResource(videoPropUri + "duration");
	newvalue = RDF.GetLiteral(videoInfo.duration);
	dsource.Assert(newnode, labelprop, newvalue, true);

	labelprop = RDF.GetResource(videoPropUri + "view");
	newvalue = RDF.GetIntLiteral(Number(videoInfo.viewCount));
	dsource.Assert(newnode, labelprop, newvalue, true);

	labelprop = RDF.GetResource(videoPropUri + "favorite");
	newvalue = RDF.GetIntLiteral(Number(videoInfo.favoriteCount));
	dsource.Assert(newnode, labelprop, newvalue, true);

	initRDFC(videosUri);
	if (RDFC.IndexOf(newnode) == -1) {
	    if (!index) {
		RDFC.AppendElement(newnode);
	    } else {
		RDFC.InsertElementAt(newnode, index + 1, true);
	    }
	}

	var oldIndex = rlbPlaylists.selectedIndex;
	if (playlistTitle) {
	    initRDFC(playlistsUri + "/" + playlistTitle);
	    if (RDFC.IndexOf(newnode) == -1) {
		if (!index) {
		    RDFC.AppendElement(newnode);
		} else {
		    RDFC.InsertElementAt(newnode, index + 1, true);
		}

		//				_rebuildPlaylists();
	    } else {
		writeStatusbar("Already exists: " + videoInfo.title);
		return false;
	    }
	}

	_flushDataSource();
	rlbPlaylists.selectedIndex = oldIndex;
    };

    that.addVideoWithinBrowser = function() {
	var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
	var win = wm.getMostRecentWindow(null);
	var mainDocument = win.content.document;
	var videoId = null, regExpr = null, rObj = null;
	if (mainDocument.URL.indexOf("nicovideo.jp") !== -1) {
	    let regExpr = /watch\/(\w\w\d+)|(\d+)$/;
	    rObj = new RegExp(regExpr);
	    if (mainDocument.URL.match(rObj)) {
		videoId = RegExp.$1;
	    } else {
		log("URL didn't match the Niconico video id regular expression.");
		return false;
	    }
	} else if (mainDocument.URL.indexOf("youtube.com") !== -1) {
	    title = mainDocument.title;
	    let regExpr = /watch\?v=(\w+)/;
	    rObj = new RegExp(regExpr);
	    if (mainDocument.URL.match(rObj)) {
		videoId = RegExp.$1;
	    } else {
		log("URL didn't match the Youtube video id regular expression.");
		return false;
	    }
	} else {
	    return;
	}

	if (rlbPlaylists.selectedItem.value === "all") {
	    that.addToPlaylist(null, videoId);
	} else {
	    that.addToPlaylist(selectedPlaylist.get_name(), videoId);
	}
    };

    var arrangeRDFPlaylist = function(beforeItemResource, afterItemResource, insertionItemResource, seqUri) {
	if (afterItemResource !== null && afterItemResource.ValueUTF8 === insertionItemResource.ValueUTF8) {
	    return;
	}

	if (!seqUri) {
	    seqUri = videosUri;
	}

	initRDFC(seqUri);
	RDFC.RemoveElement(insertionItemResource, true);

	if (beforeItemResource === null) {
	    RDFC.InsertElementAt(insertionItemResource, 1, true);
	} else if (afterItemResource === null) {
	    RDFC.AppendElement(insertionItemResource, true);
	} else {
	    RDFC.InsertElementAt(insertionItemResource, RDFC.IndexOf(afterItemResource), true);
	}

	_flushDataSource();
    };

    that.playlistObserver = function(event) {
	switch(event.type) {
	case "dragstart":
	    event.dataTransfer.mozSetDataAt('application/x-moz-node', event.currentTarget, 0);
	    break;
	case "dragover":
	    if (oldTarget) {
		oldTarget.setAttribute("style", "");
	    }

	    if (event.dataTransfer.types.contains("application/x-moz-node")) {
		var tY = event.currentTarget.boxObject.y;  // target y pos
		var tHeight = event.currentTarget.boxObject.height;  // target height
		var mY = event.clientY;  // mouse y pos
		var tCenterY = tY + tHeight / 2;

		oldTarget = event.currentTarget;

		if (mY < tCenterY && event.currentTarget.value !== "all") {
		    event.currentTarget.setAttribute("style", "padding-top: 0px; border-top: black solid 1px;");
		    isBorderTop = true;
		} else {
		    event.currentTarget.setAttribute("style", "padding-top: 0px; border-bottom: black solid 1px;");
		    isBorderTop = false;
		}
	    } else if (event.dataTransfer.types.contains("text/treeitemIndexes") || event.dataTransfer.types.contains("text/videoId")) {
		oldTarget = event.currentTarget;
		if (event.currentTarget.value === "all") {
		    return;
		}

		event.currentTarget.setAttribute("style", "background-color: #3399FF;");
	    } else {
		return;
	    }

	    event.preventDefault();
	    break;
	case "drop":
	    playlistTitle = event.currentTarget.firstChild.value;

	    if (oldTarget) {
		oldTarget.setAttribute("style", "");
	    }

	    if (event.currentTarget.value === "all") {
		return;
	    }

	    if (event.dataTransfer.types.contains("application/x-moz-node")) {
		var beforeItem, afterItem;
		if (isBorderTop) {
		    beforeItem = event.currentTarget.previousSibling;
		    afterItem = event.currentTarget;
		} else {
		    beforeItem = event.currentTarget;
		    afterItem = event.currentTarget.nextSibling;
		}

		var beforeItemResource = null, afterItemResource = null, insertionItemResource = null;
		var biPlName = null, aiPlName = null, iiPlName = event.dataTransfer.mozGetDataAt("application/x-moz-node", 0).firstChild.value;
		if (beforeItem !== null && beforeItem.tagName == "richlistitem") {
		    biPlName = beforeItem.firstChild.value;
		}

		if (afterItem !== null && afterItem.tagName == "richlistitem") {
		    aiPlName = afterItem.firstChild.value;
		}

		initRDFC(playlistsUri);
		if (biPlName !== null) {
		    beforeItemResource = RDF.GetResource(playlistsUri + "/" + biPlName);
		}

		if (aiPlName !== null) {
		    afterItemResource = RDF.GetResource(playlistsUri + "/" + aiPlName);
		}

		if (iiPlName !== null) {
		    insertionItemResource = RDF.GetResource(playlistsUri + "/" + iiPlName);
		}

		arrangeRDFPlaylist(beforeItemResource, afterItemResource, insertionItemResource, playlistsUri);
	    } else if (event.dataTransfer.types.contains("text/treeitemIndexes")) {
		var indexes = event.dataTransfer.mozGetDataAt("text/treeitemIndexes", 0).split(",");
		for (var i in indexes) {
		    playlistsManager.addToPlaylist(playlistTitle, trPlContents.view.getItemAtIndex(indexes[i]).getAttribute("value"));
		}

		trPlContents.view.selection.clearSelection();
	    } else if (event.dataTransfer.types.contains("text/videoId")) {
		let videoId = event.dataTransfer.getData("text/videoId");
		playlistsManager.addToPlaylist(playlistTitle, videoId);
	    }

	    _rebuildPlaylist();
	    break;
	case "dragend":
	    for (let i = 0; i < rlbPlaylists.itemCount; i++) {
		rlbPlaylists.getItemAtIndex(i).setAttribute("style", "");
	    }
	    break;
	default:
	    break;
	}
    };

    that.playlistContentObserver = function(event) {
	var indexes = null;
	var targetIndex = -1;

	switch(event.type) {
	case "dragstart":
	    var start = new Object();
	    var end = new Object();
	    var numRanges = trPlContents.view.selection.getRangeCount();
	    var strIndexes = "";

	    if (numRanges > 0) {
		for (var t = 0; t < numRanges; t++){
		    trPlContents.view.selection.getRangeAt(t,start,end);
		    for (var v = start.value; v <= end.value; v++){
			strIndexes += v + ",";
		    }
		}

		strIndexes = strIndexes.substring(0, strIndexes.length - 1);
		event.dataTransfer.mozSetDataAt("text/treeitemIndexes", strIndexes, 0);
	    }

	    break;

	case "dragover":
	    indexes = event.dataTransfer.mozGetDataAt("text/treeitemIndexes", 0).split(",");
	    let isVideoId = event.dataTransfer.types.contains("text/treeitemIndexes");
	    if (!isVideoId || indexes.length > 1) {
		return;
	    }

	    try {
		targetIndex = trPlContents.boxObject.QueryInterface(Ci.nsITreeBoxObject).getRowAt(event.clientX, event.clientY);
	    } catch (e) {
		return;
	    }

	    if (0 <= oldTargetIndex && oldTargetIndex < trPlContents.view.rowCount) {
		trPlContents.view.getItemAtIndex(oldTargetIndex).firstChild.setAttribute("properties", "");
	    }

	    if (targetIndex < 0 || targetIndex === trPlContents.currentIndex) {
		return;
	    }

	    var tHeight = trPlContents.boxObject.QueryInterface(Ci.nsITreeBoxObject).rowHeight;  // target height
	    var headerHeight = 24;
	    var tY = trPlContents.boxObject.QueryInterface(Ci.nsITreeBoxObject).y + headerHeight + targetIndex * tHeight;  // target y pos
	    var mY = event.clientY;  // mouse y pos
	    var tCenterY = tY + tHeight / 2;
	    oldTargetIndex = targetIndex;

	    if (mY < tCenterY) {
		trPlContents.view.getItemAtIndex(targetIndex).firstChild.setAttribute("properties", "drop-above");
		isBorderTop = true;
	    } else {
		trPlContents.view.getItemAtIndex(targetIndex).firstChild.setAttribute("properties", "drop-below");
		isBorderTop = false;
	    }

	    event.preventDefault();
	    break;

	case "drop":
	    indexes = event.dataTransfer.mozGetDataAt("text/treeitemIndexes", 0).split(",");
	    let sourceIndex = Number(indexes[0]);
	    try {
		targetIndex = trPlContents.boxObject.QueryInterface(Ci.nsITreeBoxObject).getRowAt(event.clientX, event.clientY);
	    } catch (e) {
		return;
	    }

	    if (targetIndex == sourceIndex) {
		return;
	    }

	    var seqUri = null, beforeItemResource = null, afterItemResource = null, insertionItemResource = null;
	    var biVideoId = null, aiVideoId = null, iiVideoId = trPlContents.view.getItemAtIndex(sourceIndex).getAttribute("value");
	    if (isBorderTop) {
		if (targetIndex > 0) {
		    biVideoId = trPlContents.view.getItemAtIndex(targetIndex - 1).getAttribute("value");
		}

		aiVideoId = trPlContents.view.getItemAtIndex(targetIndex).getAttribute("value");
	    } else {
		if (targetIndex < trPlContents.view.rowCount - 1) {
		    aiVideoId = trPlContents.view.getItemAtIndex(targetIndex + 1).getAttribute("value");
		}

		biVideoId = trPlContents.view.getItemAtIndex(targetIndex).getAttribute("value");
			}

			if (selectedPlaylist.isMaster()) {
				seqUri = videosUri;
			} else {
				seqUri = playlistsUri + "/" + selectedPlaylist.get_name();
			}

			if (biVideoId !== null) {
				beforeItemResource = RDF.GetResource(baseVideoUri + newVideo().get_videoSiteName(biVideoId) + "/" + biVideoId);
			}

			if (aiVideoId !== null) {
				afterItemResource = RDF.GetResource(baseVideoUri + newVideo().get_videoSiteName(aiVideoId) + "/" + aiVideoId);
			}

			if (iiVideoId !== null) {
				insertionItemResource = RDF.GetResource(baseVideoUri + newVideo().get_videoSiteName(iiVideoId) + "/" + iiVideoId);
			}

			var oldIndex = rlbPlaylists.selectedIndex;
			arrangeRDFPlaylist(beforeItemResource, afterItemResource, insertionItemResource, seqUri);
//			rlbPlaylists.selectedIndex = oldIndex;
			break;
		case "dragend":
			if (trPlContents.view) {
				for (var i = 0; i < trPlContents.view.rowCount; i++) {
					trPlContents.view.getItemAtIndex(i).firstChild.setAttribute("properties", "");
				}
			}
			break;
		default:
			break;
		}
	};

	that.onPlaylistSelectionChanged = function() {
		if (!isLoaded) {
			return;
		}

		// save playlist's selectedIndex
		prefBranch.setIntPref("playlist.index", rlbPlaylists.selectedIndex);

		var rliSelectedPlaylist = rlbPlaylists.selectedItem;
		if (rliSelectedPlaylist === null || rliSelectedPlaylist.firstChild === null || rliSelectedPlaylist.tagName !== "richlistitem") {
			trPlContents.ref = "";
			bxGridView.ref = "";
			return;
		}

		var playlist = newPlaylist(rliSelectedPlaylist.firstChild.value);
		if (rliSelectedPlaylist.value === "all") {
			trPlContents.ref = videosUri;
			bxGridView.ref = videosUri;
			playlist.setMaster(true);
		} else {
			trPlContents.ref = "http://suplik.net/bgmfox/playlists/" + rliSelectedPlaylist.firstChild.value;
			bxGridView.ref = "http://suplik.net/bgmfox/playlists/" + rliSelectedPlaylist.firstChild.value;
			playlist.setMaster(false);
		}

		if (!playlistsManager.isListView) {
			trPlContents.setAttribute("style", "display: inherit;");
		}

		if (trPlContents.view) {
			for (var i = 0; i < trPlContents.view.rowCount; i++) {
				let treerow = trPlContents.view.getItemAtIndex(i).firstChild;
				let treecell = treerow.firstChild;
				let title = treecell.getAttribute("label");
				let id = trPlContents.view.getItemAtIndex(i).getAttribute("value");
				let thumbnail_url = treecell.nextSibling.getAttribute("src");
				let duration = treecell.nextSibling.nextSibling.getAttribute("label");
				let published = treecell.nextSibling.nextSibling.nextSibling.getAttribute("label");
				let viewCount = treecell.nextSibling.nextSibling.nextSibling.nextSibling.getAttribute("label");
				let favoriteCount = treecell.nextSibling.nextSibling.nextSibling.nextSibling.nextSibling.getAttribute("label");
				var video = newVideo(title, id, thumbnail_url, duration, published, viewCount, favoriteCount);
				playlist.add(video);
			}
		}

		if (!playlistsManager.isListView) {
			trPlContents.setAttribute("style", "display: none;");
		}

		selectedPlaylist = playlist;
		videoManager.markPlayingVideo();
	};

	that.onPlaylistsKeyup = function(event) {
		if (event.keyCode == event.DOM_VK_DELETE) {
			event.stopPropagation();
			that.deletePlaylist();
		}
	};

	that.onPlaylistContentsKeyup = function(event) {
		switch (event.keyCode) {
		case event.DOM_VK_DELETE:
			event.stopPropagation();
			that.deleteVideos();
			break;
		case event.DOM_VK_RETURN:
		case event.DOM_VK_ENTER:
			event.stopPropagation();
			if (event.target.tagName === "image") {
				that.onPlayListItemDblClicked(event);
			} else {
				that.onPlayListItemDblClicked({currentTarget: trPlContents.childNodes[2]});
			}

			break;
		case event.DOM_VK_UP:
		case event.DOM_VK_LEFT:
			if (!event.ctrlKey && event.currentTarget.tagName === "vbox") {
				event.stopPropagation();
				gridView.focusPreviousItem();
			}

			break;
		case event.DOM_VK_DOWN:
		case event.DOM_VK_RIGHT:
			if (!event.ctrlKey && event.currentTarget.tagName === "vbox") {
				event.stopPropagation();
				gridView.focusNextItem();
			}

			break;
		default:
			break;
		}
	};

	that.onPlayListItemDblClicked = function() {
		var video;

		if (that.isListView) {
			if (trPlContents.view === null) {
				return;
			}

			video = selectedPlaylist.get(trPlContents.view.getItemAtIndex(trPlContents.currentIndex).getAttribute("value"));
		} else {
			video = selectedPlaylist.get(gridView.get_selectedVideoId());
		}

		if (document.getElementById("tbbxMainList").selectedIndex === 0) {
			videoManager.set_isPlaylistItemPlaying(true);
		} else {
			videoManager.set_isPlaylistItemPlaying(false);
		}

		if (!video) {
			log("video is null");
//			that.onPlaylistSelectionChanged();
//			setTimeout(function() {that.onPlayListItemDblClicked();}, 500);
			return;
		}

		videoManager.set_currentPlaylist(selectedPlaylist);
		videoManager.loadVideo(video);
	};

	that.onUpdateVideoInfo = function() {
		var indexes = new Array();

		if (playlistsManager.isListView && trPlContents.view) {
			var start = new Object();
			var end = new Object();
			var numRanges = trPlContents.view.selection.getRangeCount();
			if (numRanges > 0) {
				for (var t = 0; t < numRanges; t++){
					trPlContents.view.selection.getRangeAt(t,start,end);
					for (var v = start.value; v <= end.value; v++){
						that.updateVideoInfo(trPlContents.view.getItemAtIndex(v).getAttribute("value"));
					}
				}
			}
		} else {
			that.updateVideoInfo(gridView.get_selectedVideoId());
		}
	};

	that.onTooltipShowing = function(event) {
		let row = {}, column = {}, part = {};
		try {
			trPlContents.boxObject.QueryInterface(Ci.nsITreeBoxObject).getCellAt(event.clientX, event.clientY, row, column, part);
		} catch(e) {
//			event.preventDefault();
		}

		if (0 <= row.value && column.value !== null && column.value.id === 'trclThumbnail_url') {
			document.getElementById("imgThumbnail").setAttribute("src", trPlContents.view.getItemAtIndex(row.value).firstChild.firstChild.nextSibling.getAttribute("src"));
			document.getElementById("tltpThumbnail").openPopup(rlbPlaylists, "before_start", 0, 0, false);
		} else {
			document.getElementById("tltpThumbnail").hidePopup();
		}
	};

	that.updatePlaylistInfo = function() {
		if (playlistsManager.isListView && trPlContents.view) {
			for (let i = 0; i < trPlContents.view.rowCount; i++) {
				that.updateVideoInfo(trPlContents.view.getItemAtIndex(i).getAttribute("value"));
			}
		} else {
			for (let i = 0; i < gridView.get_itemCount(); i++) {
				that.updateVideoInfo(gridView.get_videoIdAtIndex(i));
			}
		}
	};

	that.updateVideoInfo = function(videoId) {
		var node = RDF.GetResource(baseVideoUri + newVideo().get_videoSiteName(videoId) + "/" + videoId);
		let oldSelectedIndex = gridView.get_selectedIndex();
		var success = _removeResource(node);
		if (success) {
			getVideoInfo(videoId,
				function(videoInfo) {
					_writeVideoResource(node, null, videoInfo);
					if (oldSelectedIndex !== -1) {
						gridView.set_selectedIndex(oldSelectedIndex);
					}

					videoManager.markPlayingVideo();
				}
			);
		}
	};

	_init();
	return that;
}

/*  Playlist class

 */
var newPlaylist = function (name, isMylist, groupId) {
	if (name === null || name === "") {
		throw 'input a playlist name.';
	}


	var that = {};
	var items = [];
	var isMaster = false;
	that.isMylist = isMylist || false;
	that.groupId = groupId || null;

	that.get_name = function () {
		return name;
	};

	that.isMaster = function() {
		return isMaster;
	};

	that.setMaster = function(boolean) {
		isMaster = boolean;
	};

	that.add = function(video) {
		items.push(video);
	};

	that.hasNextOf = function(video) {
		var repeatValue = videoManager.repeatValue;
		if (indexOf(video) == -1) {
			return false;
		}

		if (repeatValue == enumRepeatValues.noRepeat) {
			return (indexOf(video) < (items.length - 1) || (items.length > 1 && videoManager.isShuffleOn()));
		} else if (repeatValue == enumRepeatValues.allRepeat || repeatValue == enumRepeatValues.oneRepeat) {
			return true;
		} else {
			throw "invalid repeatValue.";
		}
	};

	that.getNextOf = function(video) {
		var repeatValue = videoManager.repeatValue;
		var returnItem;

		if(repeatValue !== enumRepeatValues.oneRepeat && videoManager.isShuffleOn()) {
			let currentIndex = indexOf(video);
			let nextIndex = currentIndex;
			let count = 0;
			while (currentIndex === nextIndex && count < 10) {
				count++;
				nextIndex = Math.floor( Math.random() * items.length );
			}

			returnItem = items[nextIndex];
		} else {
			if (repeatValue == enumRepeatValues.noRepeat) {
				returnItem = items[indexOf(video) + 1];
			} else if (repeatValue == enumRepeatValues.oneRepeat) {
				returnItem = items[indexOf(video)];
			} else if (repeatValue == enumRepeatValues.allRepeat) {
				if (indexOf(video) >= items.length - 1) {
					returnItem = items[0];
				} else {
					returnItem = items[indexOf(video) + 1];
				}
			} else {
				throw "invalid repeatValue.";
			}
		}

		return returnItem;
	};

	that.hasPreviousOf = function(video) {
		var repeatValue = videoManager.repeatValue;
		if (indexOf(video) == -1) {
			return false;
		}

		if (repeatValue == enumRepeatValues.noRepeat || repeatValue == enumRepeatValues.allRepeat) {
			return indexOf(video) > 0;
		} else if (repeatValue == enumRepeatValues.oneRepeat) {
			return true;
		} else {
			throw "invalid repeatValue.";
		}
	};

	that.getPreviousOf = function(video) {
		var repeatValue = videoManager.repeatValue;
		var returnItem;

		if(repeatValue !== enumRepeatValues.oneRepeat && videoManager.isShuffleOn()) {
			let currentIndex = indexOf(video);
			let nextIndex = currentIndex;
			let count = 0;
			while (currentIndex === nextIndex && count < 10) {
				count++;
				nextIndex = Math.floor( Math.random() * items.length );
			}

			returnItem = items[nextIndex];
		} else {
			if (repeatValue == enumRepeatValues.noRepeat || repeatValue == enumRepeatValues.allRepeat) {
				returnItem = items[indexOf(video) - 1];
			} else if (repeatValue == enumRepeatValues.oneRepeat) {
				returnItem = items[indexOf(video)];
			} else {
				throw "invalid repeatValue.";
			}
		}

		return returnItem;
	};

	var indexOf = function(video) {
		for (var i = 0; i < items.length; i++) {
			if (items[i].get_id() == video.get_id()) {
				return i;
			}
		}

		return -1;
	};

	that.get = function(id) {
		for (var i = 0; i < items.length; i++) {
			if (items[i].get_id() == id) {
				return items[i];
			}
		}

		return null;
	};

	that.get_length = function() {
		return items.length;
	};

	that.get_itemAt = function(index) {
		return items[index];
	};

	return that;
};

/*  ScrollingVideoTitle class

 */
var newScrollingVideoTitle = function() {
	var that = {};
	var labelElem, containerElem;
	var increment = -1;
	var timerID;
	const paddingstart = 0, paddingend = 10;
	const switchDirectionSleep = 3000;
	const scrollSleep = 100;

	var _init = function() {
		labelElem = document.getElementById("lblVideoTitle");
		containerElem = document.getElementById("videoTitleContainer");
		that.startScroll();
	};

	that.startScroll = function() {
		var newLeft = labelElem.left*1 + increment;
		var textEndsAt = labelElem.boxObject.width*1 + newLeft*1;

		that.stopScroll();

		if (
			((increment < 0) && (textEndsAt + paddingend <= containerElem.boxObject.width)) ||
			((increment > 0) && (labelElem.left - paddingstart >= 0))
		) {
			increment = -increment;
			timerID = setTimeout(that.startScroll, switchDirectionSleep);
	  	} else {
			labelElem.left = newLeft;
			timerID = setTimeout(that.startScroll, scrollSleep);
		}
	};

	that.stopScroll = function() {
		if (timerID != 0) {
			clearTimeout(timerID);
			timerID = 0;
		}
	};

	_init();
	return that;
};

/*  Video class

 */
var newVideo = function(title, id, thumbnail_url, duration, published, viewCount, favoriteCount) {
	var that = {};

	that.get_title = function() {
		return title;
	};

	that.get_id = function() {
		return id;
	};

	that.get_thumbnail_url = function() {
		return thumbnail_url;
	};

	that.get_duration = function() {
		return duration;
	};

	that.get_duration_seconds = function() {
		return strToSeconds(duration);
	};

	that.get_published = function() {
		return published;
	};

	that.get_viewCount = function() {
		return viewCount;
	};

	that.get_favoriteCount = function() {
		return favoriteCount;
	};

	// @overload
	// this method can take an argument and perform like a class method.
	that.get_videoSiteName = function() {
		var tmpVideoId = null;
		if (arguments[0] != null) {
			tmpVideoId = arguments[0];
		} else {
			tmpVideoId = id;
		}

		if (isNicoVideoId(tmpVideoId)) {
			return "niconico";
		} else {
			return "youtube";
		}
	};

	return that;
};

/*  ContextPlaylist object

 */
var ContextPlaylist = {
	XUL_NS: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
	popup: null,
	selectedVideoId: null,

	init: function() {
		this.popup = document.getElementById("addToPlaylist-context");
		this.popup.addEventListener("command", this, false);
	},

	handleEvent: function(event) {
		switch (event.type) {
		case "command":
			if (event.target.value === "all") {
				playlistsManager.addToPlaylist(null, this.selectedVideoId);
			} else {
				playlistsManager.addToPlaylist(event.target.label, this.selectedVideoId);
			}

			break;
		}
	},

	addToMylist: function(event) {
		mylistManager.addToMylist(event.target.value, this.selectedVideoId);
	},

	setVideo: function(event) {
		var item = event.currentTarget.selectedItem;
		this.selectedVideoId = item.value;
		return true;
	}
};

/*  RdfManager class

 */
var createRdfManager = function() {
    var that = {};
    var plWRFunc, plDRFunc, plcWRFunc, plcDRFunc;
    var dsLoadedFunc;
    var RDF = '@mozilla.org/rdf/rdf-service;1';
    RDF = Components.classes[RDF].getService();
    RDF = RDF.QueryInterface(Components.interfaces.nsIRDFService);

	var playlistListener = {
		willRebuild : function(builder) {
			if (plWRFunc) {
				let func = plWRFunc;
				plWRFunc = null;
				func();
			}
		},
		didRebuild : function(builder) {
			if (plDRFunc) {
				let func = plDRFunc;
				plDRFunc = null;
				func();
			}
		}
	};

	var playlistContentListener = {
		willRebuild : function(builder) {
			if (plcWRFunc) {
				let func = plcWRFunc;
				plcWRFunc = null;
				func();
			}
		},
		didRebuild : function(builder) {
			if (plcDRFunc) {
				let func = plcDRFunc;
				plcDRFunc = null;
				func();
			}
		}
	};

	// RDF/XML の読み込み進捗を観察するオブジェクト
	var datasourceObserver = {
		onBeginLoad: function(aSink) {},
		onInterrupt: function(aSink) {},
		onResume: function(aSink) {},
		onEndLoad: function(aSink) {
			if (dsLoadedFunc) {
				let func = dsLoadedFunc;
				dsLoadedFunc = null;
				log("run dsLoadedFunc");
				func();
			}

		},

	  	onError: function(aSink, aStatus, aErrorMsg)
	    { alert("error! " + aErrorMsg); }
	};

	that.loadDataSource = function (func) {
		_initDataSource();
		document.getElementById("rlbPlaylists").database.AddDataSource(dsource);
		document.getElementById("trPlaylistContents").database.AddDataSource(dsource);
		document.getElementById("bxGridView").database.AddDataSource(dsource);
		document.getElementById("addToPlaylist-context").database.AddDataSource(dsource);
		document.getElementById("copyToPlaylist-context").database.AddDataSource(dsource);

		// ここで、ロードされたかそうでないか確認…
		var remote = dsource.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource);

		if (remote.loaded) {
			func();
		}
		else {

		  // RDF/XML データソースは '''nsIRDFXMLSink''' でもあります
		  var sink = dsource.QueryInterface(Components.interfaces.nsIRDFXMLSink);

		  // Observer を sinkとしてのデータソースに関連付けます
		  rdfManager.set_dsLoadedFunc(func);
		  sink.addXMLSinkObserver(that.get_DatasourceObserver());
		}
	};

	var _initDataSource = function() {
	    var dsourceUri = dirService.get("ProfD", Ci.nsIFile);
	    dsourceUri.append(playlistFileName);
	    dsource = RDF.GetDataSource("file:///" + dsourceUri.path);
	};

	var _init = function() {
		createDefaultLibrary();
	};

	var createDefaultLibrary = function() {
	    var playlistsFile = dirService.get("ProfD", Ci.nsIFile);
	    playlistsFile.append(playlistFileName);
	    if (!playlistsFile.exists()) {
		const id = "bgmfox@suplik.net";
		var defaultPlaylistsFile = Components.classes["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager).getInstallLocation(id).getItemLocation(id);
		defaultPlaylistsFile.append("defaults");
		defaultPlaylistsFile.append("preferences");
		defaultPlaylistsFile.append(playlistFileName);
		defaultPlaylistsFile.copyTo(dirService.get("ProfD", Ci.nsIFile), "");
	    }
	};


	that.get_playlistListener = function() {
		return playlistListener;
	};

	that.get_playlistContentListener = function() {
		return playlistContentListener;
	};

	that.get_DatasourceObserver = function() {
		return datasourceObserver;
	};

	that.setPlWRFunc = function(func) {
		plWRFunc = func;
	};

	that.setPlDRFunc = function(func) {
		plDRFunc = func;
	};

	that.setPlcWRFunc = function(func) {
		plcWRFunc = func;
	};

	that.setPlcDRFunc = function(func) {
		plcDRFunc = func;
	};

	that.set_dsLoadedFunc = function(func) {
		dsLoadedFunc = func;
	};

	that.importLibrary = function() {
	    var nsIFilePicker = Components.interfaces.nsIFilePicker;
	    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	    fp.init(window, "Select a " + playlistFileName, nsIFilePicker.modeOpen);
	    fp.appendFilter(playlistFileName, "*.rdf");
	    fp.appendFilter("All file", "*.*;");
	    var res = fp.show();
	    if (res == nsIFilePicker.returnOK){
		var libraryFile = fp.file;
		if (libraryFile.leafName !== playlistFileName) {
		    alert("Select a " + playlistFileName);
		    return;
		}

		var playlistsFile = dirService.get("ProfD", Ci.nsIFile);
		playlistsFile.append(playlistFileName);

		if (playlistsFile.exists()) {
		    var params = {inn: {}, out: null};
		    window.openDialog("chrome://bgmfox/content/confirmOverwriteLibraryDialog.xul", "confirmOverwriteLibraryDialog", "chrome,modal,centerscreen,resizable=yes", params);
		    if (!params.out) {
			return;
		    }

		    playlistsFile.remove(false);
		}

		document.getElementById("rlbPlaylists").database.RemoveDataSource(dsource);
		document.getElementById("trPlaylistContents").database.RemoveDataSource(dsource);
		document.getElementById("bxGridView").database.RemoveDataSource(dsource);
		document.getElementById("addToPlaylist-context").database.RemoveDataSource(dsource);
		document.getElementById("copyToPlaylist-context").database.RemoveDataSource(dsource);
		let sink = dsource.QueryInterface(Components.interfaces.nsIRDFXMLSink);
		sink.removeXMLSinkObserver(rdfManager.get_DatasourceObserver());
		RDF.UnregisterDataSource(dsource);

		libraryFile.copyTo(dirService.get("ProfD", Ci.nsIFile), "");

		setTimeout(
		    function() {
			rdfManager.loadDataSource(
			    function() {
				let rlbPlaylists = document.getElementById("rlbPlaylists");
				that.setPlDRFunc(
				    function() {
					rlbPlaylists.selectedIndex = -1;
					rlbPlaylists.selectedIndex = 0;
				    }
				);
				rlbPlaylists.builder.rebuild();
				document.getElementById("addToPlaylist-context").builder.rebuild();
				document.getElementById("copyToPlaylist-context").builder.rebuild();
			    }
			);
		    }, 1000
		);
	    }
	};

	_init();
	return that;
};

/*  GridView class

 */
var createGridView = function(gridViewElm) {
	var that = {};
	var bxGridView = gridViewElm;
	var div;
	var focusedElement;
	that.selectedVideoId;
	var selectedIndex = -1;

	that.get_selectedVideoId = function() {
		return that.selectedVideoId;
	};

	that.get_selectedIndex = function() {
		return selectedIndex;
	};

	that.onFocus = function(event) {
		focusedElement = event.target;
		div = bxGridView.childNodes[1];
		if (focusedElement) {
			for (let i = 1; i < div.childNodes.length; i++) {
				if (div.childNodes[i].childNodes[1] === focusedElement) {
					selectedIndex = i - 1;
					that.selectedVideoId = div.childNodes[i].childNodes[0].attributes[1].value;
					return;
				}
			}
		}

		throw "invalid grid view focus";
		selectedIndex = -1;
	};

	that.focusPreviousItem = function() {
		if (focusedElement && focusedElement.parentNode.previousSibling && focusedElement.parentNode.previousSibling.tagName === "vbox") {
			focusedElement.parentNode.previousSibling.childNodes[1].focus();
		}
	};

	that.focusNextItem = function() {
		if (focusedElement && focusedElement.parentNode.nextSibling && focusedElement.parentNode.nextSibling.tagName === "vbox") {
			focusedElement.parentNode.nextSibling.childNodes[1].focus();
		}
	};

	that.set_selectedIndex = function(index) {
		if (0 <= index && index < that.get_itemCount()) {
			selectedIndex = index;
		} else {
			selectedIndex = -1;
			return;
		}

		var item = _getItemAtIndex(index);
		if (item) {
			item.childNodes[1].focus();
		}
	};

	that.get_itemCount = function() {
		var div = bxGridView.childNodes[1];
		if (div) {
			return div.childNodes.length - 1;
		}

		return 0;
	};

	that.get_videoIdAtIndex = function(index) {
		var item = _getItemAtIndex(index);
		if (item) {
			return item.firstChild.attributes[1].value;
		}

		return null;
	};

	that.set_styleToTitleAtIndex = function(i, style) {
		var item = _getItemAtIndex(i);
		if (item) {
			item.childNodes[2].setAttribute("style", style);
		}
	};

	var _getItemAtIndex = function(i) {
		var div = bxGridView.childNodes[1];
		if (div) {
			return div.childNodes[i + 1];
		}

		return null;
	};

	return that;
};

/**
 * @class MylistGridView
 */
var createMylistGridView = function(gridViewElm) {
	var that = createGridView(gridViewElm);
	that.selectedItemId = null;

	that.get_itemCountForMylist = function() {
		var div = gridViewElm.childNodes[0];
		if (div) {
			return div.childNodes.length;
		}

		return 0;
	};

	that.set_styleToTitleAtIndexForMylist = function(i, style) {
		var item = _getItemAtIndexForMylist(i);
		if (item) {
			item.childNodes[2].setAttribute("style", style);
		}
	};

	that.get_videoIdAtIndexForMylist = function(index) {
		var item = _getItemAtIndexForMylist(index);
		if (item) {
			return JSON.parse(item.firstChild.attributes[1].value).video_id;
		}

		return null;
	};

	that.onFocus = function(event) {
		focusedElement = event.target;
		div = gridViewElm.childNodes[0];
		if (focusedElement) {
			for (let i = 0; i < div.childNodes.length; i++) {
				if (div.childNodes[i].childNodes[1] === focusedElement) {
					selectedIndex = i;
					that.selectedVideoId = JSON.parse(div.childNodes[i].childNodes[0].attributes[1].value).video_id;
					that.selectedItemId = JSON.parse(div.childNodes[i].childNodes[0].attributes[1].value).item_id;
					return;
				}
			}
		}

		throw "invalid grid view focus";
		selectedIndex = -1;
	};

	var _getItemAtIndexForMylist = function(i) {
		var div = gridViewElm.childNodes[0];
		if (div) {
			return div.childNodes[i];
		}

		return null;
	};

	return that;
};

/**
 * @class mylistManager
 */
var mylistManager = {
	selectedPlaylist: null,
	oldTarget : null,
	oldTargetIndex : -1,
	isBorderTop : false,
	trPlContents : null,
	bxGridView : null,
	rlbPlaylists : null,
	isListView : false,
	mylistItemDragParam: {},
	token : null,
	gridView: null,

	sort: function(event) {
		let default_sort = prefBranch.prefHasUserValue("mylist.sortValue") ? prefBranch.getIntPref("mylist.sortValue") : enumSortValues.registerdAscending;
		switch (event.target.id) {
		case "trclName":
			if (default_sort == enumSortValues.titleAscending) {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.titleDescending);
			} else {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.titleAscending);
			}
			break;
		case "trclLength":
			if (default_sort == enumSortValues.durationAscending) {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.durationDescending);
			} else {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.durationAscending);
			}
			break;
		case "trclFirst_retrieve":
			if (default_sort == enumSortValues.addedDateAscending) {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.addedDateDescending);
			} else {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.addedDateAscending);
			}
			break;
		case "trclView_counter":
			if (default_sort == enumSortValues.viewCountAscending) {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.viewCountDescending);
			} else {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.viewCountAscending);
			}
			break;
		case "trclMylist_counter":
			if (default_sort == enumSortValues.mylistCountAscending) {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.mylistCountDescending);
			} else {
				prefBranch.setIntPref("mylist.sortValue", enumSortValues.mylistCountAscending);
			}
			break;
		}

		this.onPlaylistSelectionChanged();
	},

	copyToBgmfox: function() {
		var success = playlistsManager.createPlaylist(this.selectedPlaylist.get_name());
		if (success) {
			for (let i = 0; i < this.selectedPlaylist.get_length(); i += 1) {
				let videoId = this.selectedPlaylist.get_itemAt(i).get_id();
				playlistsManager.addToPlaylist(this.selectedPlaylist.get_name(), videoId);
			}
		}
	},

	renameMylist: function() {
		var params = {inn: {}, out: null};
		window.openDialog("chrome://bgmfox/content/newPlaylistDialog.xul", "newPlaylist", "chrome,modal,centerscreen,resizable=yes", params);
		if (!params.out) {
			return;
		}

		var name = params.out.title;
		if (name == this.selectedPlaylist.get_name()) {
			return;
		}

		let groupId = this.getSelectedGroupId();
		var query = 'http://www.nicovideo.jp/api/mylistgroup/update?group_id={group_id}&name={name}&token={token}'.replace('{group_id}', groupId).replace("{name}", name);
		this._sendQuery(query, this.loadMylists);
	},

	fillMylistsMenuItem : function(menuId) {
		var menu = document.getElementById(menuId);
		var menupopup = menu.firstChild;
		while (menupopup.hasChildNodes()) {
			menu.removeItemAt(0);
		}
		
		for (let i = 0; i < this.rlbPlaylists.itemCount; i += 1) {
			let title = this.rlbPlaylists.getItemAtIndex(i).firstChild.value;
			let groupId = this.rlbPlaylists.getItemAtIndex(i).value;
			menu.appendItem(title, groupId);
		}
	},

	_clearMylists: function() {
		let rlbMylists = document.getElementById("rlbMylists");
		const itemCount = rlbMylists.itemCount;
		for (let i = 0; i < itemCount; i += 1) {
			rlbMylists.removeItemAt(0);
		}
	},

	loadMylists : function() {
		this._clearMylists();
		this._clearMylistContent();

		if (videoManager) {
			videoManager.login();
		} else {
			return;
		}

		getToken();
		let query = 'http://www.nicovideo.jp/api/mylistgroup/list';
		$.get(query, function(json_response) {
			let json = JSON.parse(json_response);
			if (json.status == "fail") {
				alert("failed to log in");
				return;
			}

			// success
			let mylists = json.mylistgroup;
			let rlbMylists = document.getElementById("rlbMylists");
			for (let i = 0; i < mylists.length; i += 1) {
				let item = document.createElement("richlistitem");
				let label = document.createElement("label");
				label.setAttribute("value", mylists[i].name);
				item.appendChild(label);
				item.setAttribute("value", mylists[i].id);
				item.setAttribute("context", "mylist-context");
				item.addEventListener("dragstart", mylistManager.mylistObserver, true);
				item.addEventListener("dragover", mylistManager.mylistObserver, true);
				item.addEventListener("drop", mylistManager.mylistObserver, true);
				item.addEventListener("dragend", mylistManager.mylistObserver, true);
				rlbMylists.appendChild(item);
			}

			if (prefBranch.prefHasUserValue("mylist.index")) {
				mylistManager.rlbPlaylists.selectedIndex = prefBranch.getIntPref("mylist.index");				
			}
		});
	},

	loadedFunc: function() {
		isLoaded = true;

		// set playlist's selected index to previous value.
		_rebuildPlaylists(
			function() {
				let playlistSelectedIndex = prefBranch.getIntPref("playlist.index");
				rlbPlaylists.selectedIndex = playlistSelectedIndex;
			}
		);
	},

	get_selectedPlaylist: function() {
		return this.selectedPlaylist;
	},

	gridViewObserver: function(event) {
		var indexes = null;
		var targetIndex = -1;

		switch(event.type) {
		case "dragstart":
			event.dataTransfer.setData("text/itemId", mylistManager.gridView.selectedItemId);
			break;
		default:
			break;
		}
	},

	/**
	 *
	 * @param event
	 */
	onGridViewMouseOver: function(event) {
		var videoId = JSON.parse(event.currentTarget.firstChild.attributes[1].value).video_id;
		var video = mylistManager.selectedPlaylist.get(videoId);
		if (video) {
			document.getElementById("lblTltpPublished").value = video.get_published();
			document.getElementById("lblTltpDuration").value = video.get_duration();
			document.getElementById("lblTltpViews").value = video.get_viewCount();
			document.getElementById("lblTltpFavorites").value = video.get_favoriteCount();
			document.getElementById("lblTltpTitle").value = video.get_title();
		} else {
			event.stopPropagation();
			event.preventDefault();
			return false;
		}
	},

	/**
	 * initialize
	 */
	init: function() {
		this.trPlContents = document.getElementById("trMylistContents");
		this.bxGridView = document.getElementById("bxMylistGridView");
		this.gridView = createMylistGridView(this.bxGridView);
		this.rlbPlaylists = document.getElementById("rlbMylists");
		if (this.isListView()) {
			this.isListView = true;
		} else {
			this.isListView = false;
		}
	},

	isListView: function() {
		return this.bxGridView.getAttribute("style").indexOf("block") === -1;
	},

	getSelectedGroupId: function () {
		return this.rlbPlaylists.selectedItem.value;
	},

	getSelectedMylistTitle: function () {
		return this.rlbPlaylists.selectedItem.firstChild.value;
	},

	deleteMylist: function () {
		var groupId = this.getSelectedGroupId();
		var query = 'http://www.nicovideo.jp/api/mylistgroup/delete?group_id={group_id}&token={token}'.replace('{group_id}', groupId);
		this._sendQuery(query, this.loadMylists);
	},

	createMylist: function (title, callback) {
		var handleEvent = function(event) {
				event.stopPropagation();
			};
		document.getElementById("wndwBGMFox").addEventListener("keyup", handleEvent, true);

		if (!title) {
			var params = {inn: {}, out: null};
			window.openDialog("chrome://bgmfox/content/newPlaylistDialog.xul", "newPlaylist", "chrome,modal,centerscreen,resizable=yes", params);
			if (params.out) {
				setTimeout(function() {
					document.getElementById("wndwBGMFox").removeEventListener("keyup", handleEvent, true);
					}, 1000);

				var title = params.out.title;
				if (title === "") {
					return;
				}
			}
		}

		var query = 'http://www.nicovideo.jp/api/mylistgroup/add?name={name}&description=&public={is_public}&default_sort={default_sort}&icon_id={icon_id}&token={token}'.replace('{name}', title).replace('{is_public}', '0').replace('{default_sort}', '0').replace('{icon_id}', '0');
		this._sendQuery(query, function(args) {
			this.loadMylists();
			if (callback) {
				callback(args);
			}
		});
	},

	changeView: function(event) {
		switch (event.target.id) {
		case "imgListView":
			document.getElementById("imgListView").style.display = "none";
			document.getElementById("imgGridView").style.display = "block";
			this.bxGridView.setAttribute("style", "display: none");
			this.trPlContents.setAttribute("style", "display: inherit");
			mylistManager.isListView = true;
			break;
		case "imgGridView":
			document.getElementById("imgListView").style.display = "block";
			document.getElementById("imgGridView").style.display = "none";
			this.bxGridView.setAttribute("style", "display: block");
			this.trPlContents.setAttribute("style", "display: none");
			mylistManager.isListView = false;
			break;
		default:
			throw "invalid target: " + event.target.id;
		}

		videoManager.markPlayingVideo();
	},

	_deleteVideo: function(itemIds) {
		var groupId = this.rlbPlaylists.selectedItem.value;
		var query = 'http://www.nicovideo.jp/api/mylist/delete?group_id={group_id}&{id_list}&token={token}'.replace('{group_id}', groupId).replace("{id_list}", joinItemIds(itemIds));
		this._sendQuery(query, this.onPlaylistSelectionChanged);
	},

	addToMylist: function(groupId, videoId) {
		var query = "http://www.nicovideo.jp/api/getflv?v=" + videoId;
		let item_id;
		$.get(query, function(response) {
			var regExpr = /thread_id=(\d+)/;
			var rObj = new RegExp(regExpr);

			if (response.match(rObj)) {
				item_id = RegExp.$1;
				var query = "http://www.nicovideo.jp/api/mylist/add?group_id={group_id}&item_type={item_type}&item_id={item_id}&description=&token={token}".replace("{group_id}", groupId).replace("{item_id}", item_id).replace("{item_type}", "0");
				mylistManager._sendQuery(query, null);
			}
		});
	},

	_sendQuery: function(query, callback) {
		var jsonCallback = function(json_response) {
			let json = JSON.parse(json_response);
			if (json.status == "fail") {
				//todo: handle errors
				alert(json_response);
				return false;
			}

			if (callback) {
				callback.call(mylistManager, json);
			}
		};

		query = query.replace('{token}', this.token);
		log(query);
		$.get(query, jsonCallback);
	},

	_moveToPlaylist: function(groupId, targetGroupId, itemIds) {
		var query = 'http://www.nicovideo.jp/api/mylist/move?group_id={group_id}&target_group_id={target_group_id}&{id_list}&token={token}'.replace('{group_id}', groupId).replace("{target_group_id}", targetGroupId).replace("{id_list}", joinItemIds(itemIds));
		mylistManager._sendQuery(query, this.onPlaylistSelectionChanged);
	},

	_copyToPlaylist: function(groupId, targetGroupId, itemIds) {
		var query = 'http://www.nicovideo.jp/api/mylist/copy?group_id={group_id}&target_group_id={target_group_id}&{id_list}&token={token}'.replace('{group_id}', groupId).replace("{target_group_id}", targetGroupId).replace("{id_list}", joinItemIds(itemIds));
		mylistManager._sendQuery(query, null);
	},

	_getSelectedItemOrVideoIds: function (isVideoId) {
		var ids = new Array();
		if (this.isListView) {
			let start = new Object();
			let end = new Object();
			let numRanges = this.trPlContents.view.selection.getRangeCount();
			if (numRanges > 0) {
				for (var t = 0; t < numRanges; t++) {
					this.trPlContents.view.selection.getRangeAt(t, start, end);
					for (var v = start.value; v <= end.value; v++) {
						let json = JSON.parse(this.trPlContents.view.getItemAtIndex(v).getAttribute("value"));
						if (isVideoId) {
							ids.push(json.video_id);
						} else {
							ids.push(json.item_id);
						}
					}
				}
			}
		} else {
			if (isVideoId) {
				ids.push(this.gridView.get_selectedVideoId());
			} else {
				ids.push(this.gridView.selectedItemId);
			}
		}

		return ids;
	},

	_getSelectedItemIds: function() {
		return this._getSelectedItemOrVideoIds(false);
	},

	_getSelectedVideoIds: function() {
		return this._getSelectedItemOrVideoIds(true);
	},

	deleteVideos: function() {
		var oldSelectedPlIndex = this.rlbPlaylists.selectedIndex;
		var oldSelectedVideoIndex;
		var itemIds = new Array();

		// gather selected video ids
		if (this.isListView && this.trPlContents.view && this.trPlContents.view.rowCount > 0) {
			oldSelectedVideoIndex = this.trPlContents.currentIndex;
		} else {
			oldSelectedVideoIndex = this.gridView.get_selectedIndex();
		}

		itemIds = this._getSelectedItemIds();

		// delete
		this._deleteVideo(itemIds);

		this.rlbPlaylists.selectedIndex = oldSelectedPlIndex;

		// set focus correctly
		if (this.isListView && this.trPlContents.view) {
			if (this.trPlContents.view.rowCount === 0) {
				this.trPlContents.view.selection.select(-1);
			} else if (0 <= oldSelectedVideoIndex && oldSelectedVideoIndex < this.trPlContents.view.rowCount) {
				this.trPlContents.view.selection.select(oldSelectedVideoIndex);
			} else if (oldSelectedVideoIndex >= this.trPlContents.view.rowCount) {
				this.trPlContents.view.selection.select(this.trPlContents.view.rowCount - 1);
			} else {
				throw "invalid oldSelectedVideoIndex: " + oldSelectedVideoIndex + "\n" +
						"this.trPlContents.view.rowCount: " + this.trPlContents.view.rowCount;
			}
		} else {
			if (oldSelectedVideoIndex === gridView.get_itemCount()) {
				gridView.set_selectedIndex(oldSelectedVideoIndex - 1);
			} else {
				gridView.set_selectedIndex(oldSelectedVideoIndex);
			}
		}
	},

	mylistObserver: function(event) {
		switch(event.type) {
		case "dragstart":
			event.dataTransfer.mozSetDataAt('application/x-moz-node', event.currentTarget, 0);
			break;
		case "dragover":
			if (mylistManager.oldTarget) {
				mylistManager.oldTarget.setAttribute("style", "");
			}

			if (event.dataTransfer.types.contains("application/x-moz-node")) {
				var tY = event.currentTarget.boxObject.y;  // target y pos
				var tHeight = event.currentTarget.boxObject.height;  // target height
				var mY = event.clientY;  // mouse y pos
				var tCenterY = tY + tHeight / 2;

				oldTarget = event.currentTarget;

				if (mY < tCenterY && event.currentTarget.value !== "all") {
					event.currentTarget.setAttribute("style", "padding-top: 0px; border-top: black solid 1px;");
					isBorderTop = true;
				} else {
					event.currentTarget.setAttribute("style", "padding-top: 0px; border-bottom: black solid 1px;");
					isBorderTop = false;
				}
			} else if (event.dataTransfer.types.contains("text/treeitemIndexes") || event.dataTransfer.types.contains("text/itemId")) {
				mylistManager.oldTarget = event.currentTarget;
				if (event.currentTarget.value === "all") {
					return;
				}

				event.currentTarget.setAttribute("style", "background-color: #3399FF;");
			} else {
				return;
			}

			event.preventDefault();
			break;
		case "drop":
			if (event.dataTransfer.types.contains("application/x-moz-node")) {
		    	var beforeItem, afterItem;
		    	if (isBorderTop) {
					beforeItem = event.currentTarget.previousSibling;
					afterItem = event.currentTarget;
				} else {
					beforeItem = event.currentTarget;
					afterItem = event.currentTarget.nextSibling;
				}

				var biGroupId = null, aiGroupId = null, iiGroupId = event.dataTransfer.mozGetDataAt("application/x-moz-node", 0).value;
				if (beforeItem !== null && beforeItem.tagName == "richlistitem") {
					biGroupId = beforeItem.value;
				}

				if (afterItem !== null && afterItem.tagName == "richlistitem") {
					aiGroupId = afterItem.value;
				}

				log(biGroupId + " " + aiGroupId + " " + iiGroupId);
				mylistManager.arrangeMylists(biGroupId, aiGroupId, iiGroupId);
			} else {
				mylistManager.mylistItemDragParam.targetGroupId = event.currentTarget.value;
				mylistManager.mylistItemDragParam.isListView = event.dataTransfer.types.contains("text/treeitemIndexes");
				mylistManager.mylistItemDragParam.isGridView = event.dataTransfer.types.contains("text/itemId");
				if (event.dataTransfer.types.contains("text/treeitemIndexes")) {
					mylistManager.mylistItemDragParam.indexes = event.dataTransfer.mozGetDataAt("text/treeitemIndexes", 0).split(",");
				} else if (event.dataTransfer.types.contains("text/itemId")) {
					mylistManager.mylistItemDragParam.itemId = event.dataTransfer.getData("text/itemId");
				}
				document.getElementById("popupMylistItem").openPopup(null, "", event.clientX, event.clientY, false, false);
			}

			break;
		case "dragend":
			for (let i = 0; i < mylistManager.rlbPlaylists.itemCount; i++) {
				mylistManager.rlbPlaylists.getItemAtIndex(i).setAttribute("style", "");
			}
			break;
		default:
			break;
		}
	},

	arrangeMylists: function(biGroupId, aiGroupId, iiGroupId) {
		var groupIds = [];
		for (let i = 0; i < this.rlbPlaylists.itemCount; i += 1) {
			let groupId = this.rlbPlaylists.getItemAtIndex(i).value;
			if (groupId == iiGroupId) {

			} else if (groupId == biGroupId) {
				groupIds.push(groupId);
				groupIds.push(iiGroupId);
			} else if (groupId == aiGroupId) {
				groupIds.push(iiGroupId);
				groupIds.push(groupId);
			} else {
				groupIds.push(groupId);
			}
		}

		let query = "http://www.nicovideo.jp/api/mylistgroup/sort?{group_id_list}&token={token}".replace("{group_id_list}", joinGroupIds(groupIds));
		this._sendQuery(query, this.loadMylists);
	},

	moveMylistItem: function() {
		this._moveOrCopyMylistItem(true);		
	},

	copyMylistItem: function() {
		this._moveOrCopyMylistItem(false);
	},

	copyToPlaylist: function(event) {
		var videoIds = this._getSelectedVideoIds();
		var playlistTitle = null;
		if (event.target.value !== "all") {
			var playlistTitle = event.target.label;
		}
		
		for (let i = 0; i < videoIds.length; i += 1) {
			playlistsManager.addToPlaylist(playlistTitle, videoIds[i]);
		}
	},

	_moveOrCopyMylistItem: function(doesMove) {
		var groupId = this.rlbPlaylists.selectedItem.value;
		var targetGroupId = this.mylistItemDragParam.targetGroupId;
		var itemIds = new Array();

		if (this.oldTarget) {
			this.oldTarget.setAttribute("style", "");
		}

		if (this.mylistItemDragParam.isListView) {
			var indexes = this.mylistItemDragParam.indexes;
			for (var i in indexes) {
				let json = JSON.parse(this.trPlContents.view.getItemAtIndex(indexes[i]).getAttribute("value"));
				itemIds.push(json.item_id);
			}

			if (doesMove) {
				this._moveToPlaylist(groupId, targetGroupId, itemIds);
			} else {
				this._copyToPlaylist(groupId, targetGroupId, itemIds);
			}
			this.trPlContents.view.selection.clearSelection();
		} else if (this.mylistItemDragParam.isGridView) {
			itemIds.push(this.mylistItemDragParam.itemId);
			if (doesMove) {
				this._moveToPlaylist(groupId, targetGroupId, itemIds);
			} else {
				this._copyToPlaylist(groupId, targetGroupId, itemIds);
			}
		}
	},

	mylistContentObserver: function(event) {
		var indexes = null;
		var targetIndex = -1;

		switch(event.type) {
		case "dragstart":
			var start = new Object();
			var end = new Object();
			var numRanges = this.trPlContents.view.selection.getRangeCount();
			var strIndexes = "";

			if (numRanges > 0) {
				for (var t = 0; t < numRanges; t++){
				  this.trPlContents.view.selection.getRangeAt(t,start,end);
				  for (var v = start.value; v <= end.value; v++){
				    strIndexes += v + ",";
				  }
				}

				strIndexes = strIndexes.substring(0, strIndexes.length - 1);
				event.dataTransfer.mozSetDataAt("text/treeitemIndexes", strIndexes, 0);
			}

			break;

		default:
			break;
		}
	},

	_clearMylistContent: function() {
		let treechildren = document.getElementById("trchMylist");
		while (treechildren.hasChildNodes()) {
			treechildren.removeChild(treechildren.firstChild);
		}
	},

	onPlaylistSelectionChanged: function() {
		log("onPlaylistSelectionChanged");
		let sortValue = prefBranch.getIntPref("mylist.sortValue");

		// log in and set token
		videoManager.login();
		getToken();

		// save playlist's selectedIndex
		prefBranch.setIntPref("mylist.index", this.rlbPlaylists.selectedIndex);

		var rliSelectedPlaylist = this.rlbPlaylists.selectedItem;
		if (rliSelectedPlaylist === null || rliSelectedPlaylist.firstChild === null || rliSelectedPlaylist.tagName !== "richlistitem") {
			return;
		}

		let playlistName = rliSelectedPlaylist.firstChild.value;
		var groupId = rliSelectedPlaylist.value;
		var playlist = newPlaylist(playlistName, true, groupId);

		// get videos in my list
		var query = 'http://www.nicovideo.jp/api/mylist/list?group_id={group_id}'.replace('{group_id}', groupId);
		$.get(query, function(json_response) {
			let json = JSON.parse(json_response);
			if (json.status == "fail") {
				alert("failed to get the video list of" + playlistName);
				return;
			}

			mylistManager._clearMylistContent();
			let divMylistGridView = document.getElementById("divMylistGridView");
			while (divMylistGridView.hasChildNodes()) {
				divMylistGridView.removeChild(divMylistGridView.firstChild);
			}

			let mylistItems = json.mylistitem;
			mylistItems.sort(function(a, b){
				switch(sortValue) {
				case enumSortValues.titleAscending:
					return (a.item_data.title.charCodeAt(0) - b.item_data.title.charCodeAt(0));
				case enumSortValues.titleDescending:
					return (b.item_data.title.charCodeAt(0) - a.item_data.title.charCodeAt(0));

				case enumSortValues.addedDateAscending:
					return (a.item_data.first_retrieve - b.item_data.first_retrieve);
				case enumSortValues.addedDateDescending:
					return (b.item_data.first_retrieve - a.item_data.first_retrieve);

				case enumSortValues.viewCountAscending:
					return (a.item_data.view_counter - b.item_data.view_counter);
				case enumSortValues.viewCountDescending:
					return (b.item_data.view_counter - a.item_data.view_counter);

				case enumSortValues.mylistCountAscending:
					return (a.item_data.mylist_counter - b.item_data.mylist_counter);
				case enumSortValues.mylistCountDescending:
					return (b.item_data.mylist_counter - a.item_data.mylist_counter);

				case enumSortValues.durationAscending:
					return (a.item_data.length_seconds - b.item_data.length_seconds);
				case enumSortValues.durationDescending:
					return (b.item_data.length_seconds - a.item_data.length_seconds);
				}
			})

			let treechildren = document.getElementById("trchMylist");
			for (let i = 0; i < mylistItems.length; i += 1) {
				let item_id = mylistItems[i].item_id;
				let item_data = mylistItems[i].item_data;
				let video_id = item_data.video_id;
				let title = item_data.title;
				let thumbnail_url = item_data.thumbnail_url;
				let first_retrieve = item_data.first_retrieve;
				let view_counter = item_data.view_counter;
				let mylist_counter = item_data.mylist_counter;
				let length_seconds = item_data.length_seconds;
				length_seconds = secondsToStr(length_seconds);
			  	let video = newVideo(title, video_id, thumbnail_url, length_seconds, first_retrieve, view_counter, mylist_counter);
				playlist.add(video);

				// create list view
				let treeitem = document.createElement("treeitem");
				let idObject = {"item_id" : item_id, "video_id" : video_id};
				treeitem.setAttribute("value", JSON.stringify(idObject));
				let treerow = document.createElement("treerow");
				let titleCell = document.createElement("treecell");
				titleCell.setAttribute("label", title);
				treerow.appendChild(titleCell);
				let ThumbnailUrlCell = document.createElement("treecell");
				ThumbnailUrlCell.setAttribute("src", thumbnail_url);
				ThumbnailUrlCell.setAttribute("properties", "thumbnail");
				treerow.appendChild(ThumbnailUrlCell);
				let durationCell = document.createElement("treecell");
				durationCell.setAttribute("label", length_seconds);
				treerow.appendChild(durationCell);
				let publishedDateCell = document.createElement("treecell");
				let date = new Date();
				date.setTime(parseInt(first_retrieve) * 1000);
				publishedDateCell.setAttribute("label", date.toLocaleString());
				treerow.appendChild(publishedDateCell);
				let viewCountCell = document.createElement("treecell");
				viewCountCell.setAttribute("label", view_counter);
				treerow.appendChild(viewCountCell);
				let mylistCountCell = document.createElement("treecell");
				mylistCountCell.setAttribute("label", mylist_counter);
				treerow.appendChild(mylistCountCell);
				treeitem.appendChild(treerow);
				treechildren.appendChild(treeitem);

				// create grid view
				let div = document.getElementById("divMylistGridView");
				let vbox = document.createElement("vbox");
				vbox.setAttribute("class", "thumbnail");
				vbox.setAttribute("tooltip", "tltpGridViewItem");
				vbox.addEventListener("dragstart", mylistManager.gridViewObserver, false)
				vbox.addEventListener("mouseover", mylistManager.onGridViewMouseOver, false)

				let lblVideoId = document.createElement("label");
				lblVideoId.setAttribute("class", "hidden_elm");
				lblVideoId.setAttribute("value", JSON.stringify(idObject));
				vbox.appendChild(lblVideoId);

				let image = document.createElement("image");
				image.setAttribute("class", "thumbnail");
				image.setAttribute("src", thumbnail_url);
				image.setAttribute("context", "mylistVideo-context");
				image.addEventListener("focus", mylistManager.gridView.onFocus, false)
				vbox.appendChild(image);

				let lblTitle = document.createElement("label");
				lblTitle.setAttribute("class", "thumbnail small-margin");
				lblTitle.setAttribute("context", "mylistVideo-context");
				lblTitle.addEventListener("click", function(event) {event.target.previousSibling.focus();}, false);
				let textnode = document.createTextNode(title);
				lblTitle.appendChild(textnode);
				vbox.appendChild(lblTitle);
				div.appendChild(vbox);
			}

			mylistManager.selectedPlaylist = playlist;
			videoManager.markPlayingVideo();
		});
	},

	onMylistItemDblClicked: function() {
		var video;

		if (this.selectedPlaylist == null || this.selectedPlaylist.get_length() == 0) {
			return;
		}

		if (this.isListView) {
			if (this.trPlContents.view === null) {
				return;
			}

			const videoId = JSON.parse(this.trPlContents.view.getItemAtIndex(this.trPlContents.currentIndex).getAttribute("value")).video_id;
			video = this.selectedPlaylist.get(videoId);
		} else {
			video = this.selectedPlaylist.get(gridView.get_selectedVideoId());
		}

		if (document.getElementById("tbbxMainList").selectedIndex === 0 || document.getElementById("tbbxMainList").selectedIndex === 3) {
			videoManager.set_isPlaylistItemPlaying(true);
		} else {
			videoManager.set_isPlaylistItemPlaying(false);
		}

		if (!video) {
			log("video is null");
			return;
		}

		videoManager.set_currentPlaylist(this.selectedPlaylist);
		videoManager.loadVideo(video);
	},

	onTooltipShowing: function(event) {
		let row = {}, column = {}, part = {};
		this.trPlContents.boxObject.QueryInterface(Ci.nsITreeBoxObject).getCellAt(event.clientX, event.clientY, row, column, part);

		if (0 <= row.value && column.value !== null && column.value.id === 'trclThumbnail_url') {
			document.getElementById("imgThumbnail").setAttribute("src", this.trPlContents.view.getItemAtIndex(row.value).firstChild.firstChild.nextSibling.getAttribute("src"));
			document.getElementById("tltpThumbnail").openPopup(this.rlbPlaylists, "before_start", 0, 0, false);
		} else {
			document.getElementById("tltpThumbnail").hidePopup();
		}
	},

	openOriginalMylist: function() {
		let groupId = this.getSelectedGroupId();
		mainWindow.getBrowser().addTab("http://www.nicovideo.jp/my/mylist#/{group_id}".replace("{group_id}", groupId));
	}
};