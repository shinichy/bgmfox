var prefSvc = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
var prefBranch = prefSvc.getBranch("extensions.bgmfox.");
var oldMail, oldPassword;

function onPaneload() {
	oldMail = prefBranch.getCharPref("niconicoLoginMail");
	oldPassword = prefBranch.getCharPref("niconicoLoginPassword");
}

function onAccept() {
	var newMail = document.getElementById("txtbxMail").value;
	var newPassword = document.getElementById("txtbxPassword").value;
	
	if (newMail.length > 0 && newPassword.length > 0 && (newMail !== oldMail || newPassword !== oldPassword)) {
		if (oldMail.length > 0 && oldPassword.length > 0) {
			var params = {inn: {}, out: null};
			window.openDialog("chrome://bgmfox/content/askRelogin.xul", "askRelogin", "chrome,modal,centerscreen,resizable=yes", params);
			if (!params.out) {
				return true;
			}
			
		}
		
		return login(newMail, newPassword);
	}
	
	return true;
}

function login(mail, password) {
	var cookieDomain = ".nicovideo.jp";
	var cookieName = "user_session";
	var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
	var iter = cookieManager.enumerator;
	while (iter.hasMoreElements()){
		var cookie = iter.getNext().QueryInterface(Components.interfaces.nsICookie2);
		if (cookie instanceof Components.interfaces.nsICookie) {
			if (cookie.host == cookieDomain && cookie.name == cookieName) {
				cookieManager.remove(cookieDomain, cookieName, "/", false);
				break;
			}
		}
	}
	
	var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
	const id = "bgmfox@suplik.net";
	var exePath = _chromeToPath("chrome://bgmfox/content/NiconicoUtility.exe");
	file.initWithPath(exePath);
	var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
	process.init(file);
	var args = [mail, password];
	process.run(true, args, args.length);
	
	var data = "";
	var fstream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
	var cookieFile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
	cookieFile.initWithPath(_chromeToPath("chrome://bgmfox/content/cookie.txt"));
	fstream.init(cookieFile, -1, 0, 0);
	var charset = "UTF-8";
	const replacementChar = Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
	var is = Components.classes["@mozilla.org/intl/converter-input-stream;1"].createInstance(Components.interfaces.nsIConverterInputStream);
	is.init(fstream, charset, 1024, replacementChar);

	var str = {};
	var numChars = is.readString(4096, str);
	if (numChars !== 0 /* EOF */) {
		var read_string = str.value;
	}

	is.close();
	fstream.close();
	cookieFile.remove(false);
	
	var user_sessionValue = read_string;
	if (user_sessionValue === "login failed.") {
		alert("login failed.");
		return false;
	}
	
	var enumMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	var enumDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	var d = new Date();
	d.setTime(d.getTime()+1000*60*30);
	var monthStr = enumMonths[d.getMonth()];
	var dayStr = enumDays[d.getDay()];
	
	var expiresStr = "expires={day}, {date} {month} {year} {hours}:{minutes}:{seconds} GMT".replace("{day}", dayStr).replace("{date}", d.getDate()).replace("{month}", monthStr).replace("{year}", d.getFullYear()).replace("{hours}", d.getHours()).replace("{minutes}", d.getMinutes()).replace("{seconds}", d.getSeconds());
	var cookieString = cookieName + "=" + user_sessionValue + ";domain=" + cookieDomain + ";" + expiresStr;
	var url = "http://www.nicovideo.jp/";
	var cookieUri = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI(url, null, null);
	Components.classes["@mozilla.org/cookieService;1"].getService(Components.interfaces.nsICookieService).setCookieString(cookieUri, null, cookieString, null);
	
	return true;
}

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
