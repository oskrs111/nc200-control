/* config Object template for NC200 Camera.
{
	ip:"192.168.XXX.XXX",
	user:"admin", 
	password:"admin"
}
*/

//OSLL: These two arrays contains the 'sync' quewe commands in order to retrieve the current settings on NC200.
//		Known commands:
//
//		Getters => "getcloudurl","watcherheartbeat","snapshot","getvideosetting","getsoundsetting","getosdandtimedisplay",
//				   "getvideoctrls","getreceiver","smtp_and_ftp_load","ledgetting","ddns_get","wireless_status","wireless_get"
//				   "netconf_get","get_cloud"
//
//		Setters => "setsoundsetting", "setvideosetting", "setvideoctrls","setosdandtimedisplay","setvideoctrls",
//				   "resetvideoctrls","deletereceiver","smtp_and_ftp_save","mdconfsettinginit","mdconf_set","mdconf","logout"
//
const btoa = require('btoa');
const gGetDefaultPaths = ["getvideosetting",
						 "getvideoctrls",
						 "getosdandtimedisplay",
						 "getreceiver",
						 "getsoundsetting",
						 "getcloudurl",
						 "smtp_and_ftp_load",
						 "mdconfsettinginit",
						 "ledgetting"];

const gGetDefaultPathArgs = {getvideoctrls:{all:"any value"}};

//OSLL: These paths need to be processed before send to nc200 because non standard JSON format...
const gSetDefaultPaths = ["setvideoctrls",
						 "mdconf"];

class nc200QueweItem {
	constructor(path,data){
		this._path = path;
		this._data = data;	
		//console.log('nc200QueweItem->', path, data);
	}

	getPath(){
		return this._path;
	}

	getData(){
		return this._data;
	}
}

class nc200device {
	constructor(config, updateCallback, getPaths = gGetDefaultPaths, getPathsArgs = gGetDefaultPathArgs){

		if(typeof config == 'object') this._config = config;
		else this._config = {ip:"",user:"",password:""}
		console.log('Config:', this._config);
		
		this._getDefaultPaths = getPaths;
		this._getDefaultPathArgs = gGetDefaultPathArgs;		
		this._liveData = {				
		token:"",
		cookie:"",						
		}

		this._updateCallback = updateCallback;
		this._state = "idle";		
		this._interval = 50;
		var that = this;		
		this._timer = setTimeout(function ()
		{
			that._tasker();
		}, this._interval);			
		
		this._quewe = new Array();		
		this._request = require('ajax-request');
		this._cookie = require('cookie-session');
	}
	
	connectEx(ip,user,password){				
		this._config.ip = ip;
		this._config.user = user;
		this._config.password = password;
		this._setState("sync");
	}

	connect(){				
		this._setState("sync");
	}

	updateRequest(path,data)
	{
		data = this._dataPrepare(path,data);
		var item = new nc200QueweItem(path,data);
		this._quewe.push(item);
	}
	
	_tasker()
	{
		switch(this._state)
		{
			case "idle":
				if(this._quewe.length > 0){
					let item = this._quewe[0];
					this._sendRequest(item.getPath(), item.getData());
					this._setState("ajaxWait");
				}
				break;

			case "sync":					
				let syncData = {
					length: 0
				};
				//OSLL: Add to quewe all data retrieve data paths...
				for(var t in this._getDefaultPaths)
				{
					let path = this._getDefaultPaths[t];
					let append = this._getDefaultPathArgs[path];	//OSLL: Look for specific call arguments.
					if(append == undefined) append = {};
					let item = new nc200QueweItem(path, append);
					this._quewe.push(item);
					console.log("_tasker->quewe push item...", this._quewe.length);
					syncData.length += 1;
				}				
				//OSLL: Object arrays do not show the actual contents, so...
				this._quewe.length = syncData.length;
				
				//OSLL: Anounces the initial sync task...					
				this._updateCallback("syncData", JSON.stringify(syncData));			
				this._setState("idle");	
				break;	

			case "doLogin":
				this._doLogin();
				this._setState("ajaxWait");			
				break;

			case "ajaxWait"	:
				//OSLL: Will wait here until receive reply or get timeout...
				break;		
				
			case "error":
				this._setState("idle");	
				break;
				
			default:
				break;
			
		}
		var that = this;
		this._timer = setTimeout(function (){that._tasker();}, this._interval);		
	}
	
	_setState(newState)
	{
		this._state = newState;
	}
	
	_ajaxCallback(err, res, body)
	{	
				
		if(res !== undefined) {			
			console.log("_ajaxCallback()", res.req.path, body);	
			switch(res.statusCode)
			{
				case 200:
				this._processReply(res, body);
				break;
				
				case 403:
				//OSLL: Login will happen automatically every time we receive 403 status.
				this._setState("doLogin");	
				break;
				
				default:
				break;								
			}
		}		
		else if(err !== undefined) {
			this._updateCallback("ajaxError", JSON.stringify(err));			
		}
	}
	
	_processReply(res, body)
	{
		var path = res.req.path;
		console.log("_processReply", res.req.path);
		if(path.indexOf("login") >= 0)
		{
			var obj = JSON.parse(body);
			if(typeof obj == "object")
			{
				if(typeof obj.token == "string")
				{
					this._liveData.token = obj.token;													
					this._liveData.cookie = res.headers['set-cookie'][0];										
					this._updateCallback("login", JSON.stringify(this._config));
					this._setState("sync");
					return;
				}
				else
				{
					console.log("Error: /login.fcgi " + body);
					this._updateCallback("loginError");
				}
			}
		}
		else {

			//OSLL: Non standard JSON Replies processing. From 'gSetDefaultPaths' Array. 
			for(var item in gSetDefaultPaths){
				let cmp = gSetDefaultPaths[item];
				if(path.indexOf(cmp) >= 0)
				{
					let sbody = body.split("&&");					
					this._updateCallback(cmp, sbody[0]);										
					this._quewe.shift();
					this._setState("idle");
					return;
				}
			}	
						
			path = path.substr(1,path.length-1);
			path = path.split('.')[0];
			this._updateCallback(path, body);										
			this._quewe.shift();
			this._setState("idle");
		}		
	}

	_dataPrepare(path,data)
	//OSLL: The NC200 interface is not so consistent. Therefore the data update format
	//		must be pre-processed according the nc200 expects...
	{
		let dta = {};
		switch(path)
		{
			case "setvideoctrls":			
			dta.brightness = data.brightness.value;
			dta.contrast = data.contrast.value;
			dta.saturation = data.saturation.value;
			dta.hue = data.hue.value;
			dta.grama = data.grama.value;
            dta.sharpness = data.sharpness.value;
            dta.backlight_compensation = data.backlight_compensation.value;
            dta.powerline_frequency = data.powerline_frequency.value;
			dta.image_quality = data.hue.value;				   
			dta.flip = data.flip.value;
			dta.mirror = data.mirror.value;
			return dta;			
			break;
/*
			case "mdconf":
			dta.is_enable = data.enable.value;
			dta.precision = data.precision.value;
			let t = 1;
			for(let a of data.area) {
				if(a === 1) dta['area' + t] = 1;
				else dta['area' + t] = 0;
				t++;
			}		
			return dta;			
			break;
*/
			default:
			break;
		}

		return data;
	}
	
//-----------------------------------------------------------	

	_doLogin()
	{
		var self = this;	
		var rand = Math.random() + ""; 
		
		this._request({
			url: 'http://' + this._config.ip + '/login.fcgi',
			method: 'POST',		
			data:{
				Username: this._config.user,
				Password: btoa(this._config.password)
			},
			headers: {
				'Connection': 'keep-alive',
				'Cache-Control': 'no-cache',
				'Content-Type': 'application/x-www-form-urlencoded',				 				
				'User-Agent': 'nc200-control/1.0',
				'Cookie': 'sess=' + btoa(rand)	
			}	
			}, function (err, res, body) {
			self._ajaxCallback(err, res, body);
			});
	}
	
	_sendRequest(path, data)
	{
		var self = this;
		var contentType = '';
		data.token = this._liveData.token;
												
		this._request({
		url: 'http://' + this._config.ip + '/'+ path +'.fcgi',
		method: 'POST',
		data: data,		
		//timeout: 500,	
		headers: {
			'Connection': 'keep-alive',
			'Cache-Control': 'no-cache',
			'Content-Type': 'application/x-www-form-urlencoded'				 				
			'User-Agent': 'nc200-control/1.0',
			'Cookie': this._liveData.cookie			
		}
		}, function (err, res, body) {
		self._ajaxCallback(err, res, body);
		});

		console.log("_sendRequest()", path, data);
	}		
}

module.exports.nc200device = nc200device;