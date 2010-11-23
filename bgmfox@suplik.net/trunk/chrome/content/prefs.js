const loginHostName = "https://secure.nicovideo.jp";
var loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
var prefSvc = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
var prefBranch = prefSvc.getBranch("extensions.bgmfox.");
var oldMail;
var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1", Components.interfaces.nsILoginInfo, "init");

function onPaneload() {
	oldMail = prefBranch.getCharPref("niconicoLoginMail");

	let menu = document.getElementById("mnlLoginInfo");
	if (loginManager.countLogins(loginHostName, "", "") > 0) {
		let logins = loginManager.findLogins({}, loginHostName, "", "");
		for (let i = 0; i < logins.length; i += 1) {
			let mail = logins[i].username;
			let password = logins[i].password;
			menu.appendItem(mail, password);
			if (mail == oldMail) {
				document.getElementById("txtbxPassword").value = password;
			}
		}
	}
}

function openSavedPasswordsDialog() {
	window.open('chrome://passwordmgr/content/passwordManager.xul', 'passwordManager', 'chrome,centerscreen');
}

function onStoredLoginSelectionChanged(event) {
	document.getElementById("txtbxMail").value = event.target.label;
	document.getElementById("txtbxPassword").value = event.target.value;
}

function exists(newMail, loginInfo) {
	let logins = loginManager.findLogins({}, loginHostName, "", "");
	for (let i = 0; i < logins.length; i += 1) {
		let mail = logins[i].username;
		if (mail == newMail) {
			return logins[i];
		}
	}

	return null;
}

function onAccept() {
	var newMail = document.getElementById("txtbxMail").value;
	var password = document.getElementById("txtbxPassword").value;
	
	if (newMail.length > 0 && password.length > 0   ) {
		// save new login info if it doesn't exist
		let newLogin = new nsLoginInfo(loginHostName, loginHostName, null, newMail, password, 'newMail', 'password');
		let oldLogin = exists(newMail);
		if (oldLogin) {
			loginManager.modifyLogin(oldLogin, newLogin);
		} else {
			loginManager.addLogin(newLogin);
			window.arguments[0].out = {mail: newMail, password: password};			
		}

		prefBranch.setCharPref("niconicoLoginMail", newMail);

		var params = {inn: {}, out: null};
		window.openDialog("chrome://bgmfox/content/askRelogin.xul", "askRelogin", "chrome,modal,centerscreen,resizable=yes", params);
		if (!params.out) {
			return true;
		}

		removeCookie();
		return true;
	}

	return true;
}

function removeCookie() {
	var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
	var iter = cookieManager.enumerator;
	while (iter.hasMoreElements()){
		var cookie = iter.getNext().QueryInterface(Components.interfaces.nsICookie2);
		if (cookie instanceof Components.interfaces.nsICookie) {
			if (cookie.host == ".nicovideo.jp" && cookie.name == "user_session") {
				cookieManager.remove(".nicovideo.jp", "user_session", "/", false);
				break;
			}
		}
	}

	return false;
}
