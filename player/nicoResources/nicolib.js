/* Common Class Library for nicovideo.jp */
// requires prototype.js
// requires swfobject.js

if (typeof Nico == "undefined") Nico = { };

Nico.debug = false;
Nico.log = function (msg) {
	if (Nico.debug) {
		if (typeof console != "undefined") {
			console.log(msg);
		} else {
			alert(msg);
		}
	}
};

//
// DOM ready event
//

Nico.isReady = function () { return false; };
Nico.onReady = function (fn) {
	if (Nico.isReady()) {
		try {
			fn();
		} catch (e) {
			Nico.log("Error on Nico onReady: " + (e.message || e));
		}
		return;
	} else {
		if (!Nico.onReady.functions) Nico.onReady.functions = [];
		Nico.onReady.functions.push(fn);
	}
};
Nico.__getReady = function () {
	if (Nico.isReady()) return false;
	Nico.isReady = function () { return true; };
	if (Nico.onReady.functions) {
		Nico.onReady.functions.each(function (fn) {
			try {
				fn();
			} catch (e) {
				Nico.log("Error on Nico getReady: " + (e.message || e));
			}
		});
		delete Nico.onReady.functions;
	}
	return true;
};

//
// Cookie  (requires cookie.swf)
//

Nico.Cookie = {
	get: function (name, defaultValue) {
		var re = new RegExp("(?:^|;\\s*)" + escape(name) + "\\s*=\\s*([^;]*)");
		return re.test(document.cookie) ? unescape(RegExp.$1) : defaultValue;
	},
	set: function (name, value, expires, domain, path, secure) {
		var s = escape(name) + "=" + escape(value);
		if (expires !== undefined) {
			if (!(expires instanceof Date)) {
				var dt = new Date();
				dt.setTime(dt.getTime() + expires);
				expires = dt;
			}
			s += "; expires=" + expires.toGMTString();
		}
		if (domain !== undefined) s += "; domain=" + domain;
		if (path !== undefined) s += "; path=" + path;
		if (secure) s += "; secure";
		return document.cookie = s;
	},
	remove: function (name, domain, path, secure) {
		this.set(name, "", -1, domain, path, secure);
	}
};
Cookie = Nico.Cookie;

Nico.FlashCookie = Class.create();
Nico.FlashCookie.SWF_PATH = "swf/cookie.swf?20081024";
Nico.FlashCookie.instances = [];
Nico.FlashCookie.prototype = {
	initialize: function (id) {
		this.id = id;
		this.element = null;
		this.ready = false;
		Nico.FlashCookie.instances[id] = this;
	},
	write: function (container) {
		if (this.element) return false;
		var so = new SWFObject(Nico.FlashCookie.SWF_PATH, this.id, "1", "1");
		so.addParam("allowScriptAccess", "always");
		so.addVariable("storage", this.id);
		so.setAttribute("style", "margin-left:-1000px");
		so.write(container);
		return this;
	},
	onReady: function (fn) {
		if (this.ready) {
			try {
				fn.call(this, this);
			} catch(e) {
				Nico.log("Error on FlashCookie onReady: " + (e.message || e));
			}
		} else {
			if (!this.functions) this.functions = [];
			this.functions.push(fn);
		}
		return fn;
	},
	__getReady: function () {
		if (this.ready) return;
		this.ready = true;
		if (this.functions) {
			this.functions.each(function (fn) {
				try {
					fn.call(this, this);
				} catch(e) {
					Nico.log("Error on FlashCookie getReady: " + (e.message || e));
				}
			}.bind(this));
			delete this.functions;
		}
	},

	set: function (key, value) {
		return this.element.setCookie(key, value);
	},
	get: function (key, defaultValue) {
		return this.element.getCookie(key, defaultValue);
	},
	remove: function (key) {
		this.element.removeCookie(key);
	},
	update: function (obj) {
		for (var key in obj) {
			this.element.setCookie(key, obj[key]);
		}
	}
};
FlashCookie = Nico.FlashCookie;

// called from cookie.swf
FlashCookie.readyFromSWF = function (id) {
	var instance = Nico.FlashCookie.instances[id];
	if (instance) {
		(function () {
			if (!instance.element) {
				var el;
				try { el = document.getElementById(id); } catch (e) {}
				if (!el) {
					setTimeout(arguments.callee, 100);
					return;
				}
				instance.element = el;
			}
			try {
				instance.get("init");
			} catch (e) {
				setTimeout(arguments.callee, 100);
				return;
			}
			instance.__getReady();
		})();
	}
};

//
// UI Components
//

/* LazyImage */

Nico.LazyImage = {

	margin: 200,
	waitings: [],
	className: "lazyimage",

	initialize: function () {
		var images = $$("img." + this.className);
		if (images.length > 0) {
			this.enqueue(images);
		}
		this._setPageObserver();
	},

	enqueue: function (images) {
		var self = this,
			maxY = 0,
			bottom = this._getBottomLoadingThreshold();
		(function () {
			var proceeds = images.slice(0, 10);
			images = images.slice(10);
			var image, i = 0;
			while (image = proceeds[i++]) {
				$(image).removeClassName(this.className);
				var y = (Position.cumulativeOffset(image))[1];
				if (y < bottom) {
					self._loadImage(image);
				} else {
					var item = { y: y, image: image };
					if (maxY <= y) {
						self.waitings.push(item);
						maxY = y;
					} else {
						var index = self.waitings.length - 1;
						for ( ; index >= 0; index--) {
							if (self.waitings[index].y < y) break;
						}
						self.waitings.splice(index, 0, item);
					}
				}
			}
			if (images.length > 0) {
				setTimeout(arguments.callee, 100);
			}
		})();
	},

	update: function () {
		this.waitings = this.waitings.sortBy(function (item) {
			return item.y = (Position.cumulativeOffset(item.image))[1];
		});
	},

	reset: function () {
		this.waitings = [];
		this.initialize();
	},

	_getBottomLoadingThreshold: function () {
		var y = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
		var h = window.innerHeight || document.documentElement.clientHeight || document.body.offsetHeight;
		return y + h + this.margin;
	},

	_loadImage: function (image) {
		if (image.title) {
			image.src = image.title;
			image.title = "";
		}
	},

	_setPageObserver: function () {
		if (this.pageObserver) return;

		var self = this,
			imageCount = document.images.length;
		this.pageObserver = setInterval(function () {
			var currentCount = document.images.length;
			if (currentCount != imageCount) {
				self.initialize();
				imageCount = currentCount;
				return;
			}

			if (self.waitings.length == 0)
				return;

			var bottom = self._getBottomLoadingThreshold(),
				index = 0, item;
			while ((item = self.waitings[index]) && item.y < bottom) {
				self._loadImage(item.image);
				index++;
			}
			if (index > 0) {
				self.waitings = self.waitings.slice(index);
			}
		}, 500);
	}

};

/* Template */

Nico.Template = Class.create();
Nico.Template.prototype = {
	parser: /^(?:[^\\\[]+|\\.|\[(R\$|U\$|\$|%|if|unless|else|\/if) ?(\w*)(?:\|(\d+))?\]|.)/,
	initialize: function (template) {
		this.template = template.value || String.interpret(template);
		this.cache = {};
	},
	evaluate: function (object) {
		var ifstack = [true];
		var cache = this.cache;
		return this.template.gsub(this.parser, function (m) {
			var op = m[1], arg = m[2], len = m[3];
			if (!op) {
				if (m[0].charAt(0) == "\\" && m[0].length == 2)
					return ifstack[0] ? m[0].substring(1) : "";
				else
					return ifstack[0] ? m[0] : "";
			}
			if (op == "if") {
				if (!arg) throw new Error("syntax error: if");
				ifstack.unshift(ifstack[0] && !!object[arg]);
				return "";
			}
			if (op == "unless") {
				if (!arg) throw new Error("syntax error: unless");
				ifstack.unshift(ifstack[0] && !object[arg]);
				return "";
			}
			if (op == "else") {
				if (ifstack.length <= 1) throw new Error("syntax error: else");
				ifstack[0] = (ifstack[1] && !ifstack[0]);
				return "";
			}
			if (op == "/if") {
				ifstack.shift();
				if (ifstack.length == 0) throw new Error("syntax error: /if");
				return "";
			}

			if (!ifstack[0]) {
				return "";
			}
			if (op == "R$" || op == "U$" || op == "$") {
				if (!arg) throw new Error("syntax error: $$");
				var value = String.interpret(object[arg]);
				if (len && value.length > parseInt(len))
					value = value.substring(0, len) + "...";
				if (op == "$")
					value = value.escapeHTML();
				else if (op == "U$")
					value = encodeURIComponent(value);
				return value;
			}
			if (op == "%") {
				if (!arg) throw new Error("syntax error: %");
				var tpl = cache[arg] || (cache[arg] = new Nico.Template($(arg)));
				return tpl.evaluate(object);
			}
		});
	}
};

//
// JSONP Loader
//

JSONP = Class.create();
JSONP.counter = 0;
JSONP.callbackPrefix = "__jsonp";
JSONP.getCallbackName = function (fn) {
	var cbname = this.callbackPrefix + "_" + (this.counter++);
	window[cbname] = function () {
		fn.apply(this, arguments);
		window[cbname] = undefined;
	};
	return cbname;
};
JSONP.prototype = {
	initialize: function (url, options) {
		this.url = url;
		this.options = Object.extend({
			parameters: {}
		}, options || {});
		this.fire();
	},
	fire: function () {
		var params;
		if (typeof this.options.parameters == "string")
			params = this.options.parameters.toQueryParams();
		else
			params = this.options.parameters || {};

		params = $H(params);
		params.each(function (pair) {
			if (typeof pair.value == "function") {
				params[pair.key] = JSONP.getCallbackName(pair.value);
			}
		}.bind(this));
		params["_"] = (new Date()).getTime();
		params = Hash.toQueryString(params);

		var url = this.url;
		if (params) {
			url += (url.indexOf("?") >= 0 ? "&" : "?") + params;
		}

		this.loadScript(url);
	},
	loadScript: function (url) {
		var elemScript = document.createElement('script');
		elemScript.setAttribute('type', 'text/javascript');
		elemScript.setAttribute('charset', 'utf-8');
	    elemScript.setAttribute('src', url);

		var elemHead = document.getElementsByTagName('head').item(0);
		elemHead.appendChild(elemScript);
	}
};


//
// Nico onReady event
//

(function () {
	var timer;
	var fire = function () {
		Nico.__getReady() && timer && window.clearInterval(timer);
	};

	if (document.addEventListener) {
		document.addEventListener("DOMContentLoaded", fire, false);
	}
	if (Prototype.Browser.IE && window == top) {
		(function () {
			if (Nico.isReady()) return;
			try {
				document.documentElement.doScroll("left");
			} catch (e) {
				setTimeout(arguments.callee, 0);
				return;
			}
			fire();
		})();
	}
	if (Prototype.Browser.WebKit) {
		var numStyles;
		(function () {
			if (Nico.isReady()) return;
			if (document.readyState != "loaded" && document.readyState != "complete") {
				setTimeout(arguments.callee, 0);
				return;
			}
			fire();
		})();
	}

	Event.observe(window, "load", fire);
})();
