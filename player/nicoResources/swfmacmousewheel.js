/**
 * SWFMacMouseWheel v1.0: Mac Mouse Wheel functionality in flash - http://blog.pixelbreaker.com/
 *
 * SWFMacMouseWheel is (c) 2006 Gabriel Bucknall and is released under the MIT License:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * Dependencies: 
 * SWFObject v1.5 - (c) 2006 Geoff Stearns.
 * http://blog.deconcept.com/swfobject/
 */
function SWFMacMouseWheel( swfObject )
{
	this.so = swfObject;
	var isMac = navigator.appVersion.toLowerCase().indexOf( "mac" ) != -1;
	if( isMac ) this.init();
	else if( /a/.__proto__=='//' ) this.init();
}

SWFMacMouseWheel.prototype = {
	init: function()
	{
		SWFMacMouseWheel.instance = this;
		Event.observe("flvplayer_container", "mousewheel", SWFMacMouseWheel.instance.wheel, false);
		Event.observe("flvplayer_container", "DOMMouseScroll", SWFMacMouseWheel.instance.wheel, false); // Firefox
	},
	
	handle: function( delta )
	{
		try {
			document[ this.so.getAttribute('id') ].externalMouseEvent( delta );
		} catch(e) { }
	},

	wheel: function(event){
        var delta = 0;
        if (event.wheelDelta) {
			delta = event.wheelDelta/120;
			if (window.opera) delta = -delta;
        } else if (event.detail) {
            delta = -event.detail;
        }
        if (delta) SWFMacMouseWheel.instance.handle(delta);

        if (event.preventDefault) event.preventDefault();
		event.returnValue = false;
	}
};