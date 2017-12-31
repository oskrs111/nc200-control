# nc200-control
Javascript module for tpLink NC200 Wifi Camera control. This module encapsulates in a single javascript class a proper object to comunicate with tpLink NC200 Wifi Camera throug it's ajax api.

This module was develped initially as a part of https://github.com/oskrs111/node-nc200-control application that is an alternative configuratuion frontend for the camera based on [Electron](https://electron.atom.io/) and [Polymer](https://www.polymer-project.org). 

Now i have separated this module in order to use it in another NC200 related projects like node-nc200-automation. According to that node-nc200-control will be updated according soon.

# Installation
Use the usual npm commands to get the module from npm repository

```Batchfile
> npm install nc200-control --save
```

This will install all the module with dependencies. 

**But note that there is a dependence with "ajax-request": "1.2.3". Currently there is a pending Pull Request that adds a needed functionality for this nc200-control module. So meantime, you can use the forked and modified "ajax-request" from here https://github.com/oskrs111/ajax-request.** Once installed nc200-control module from npm, just navigate to **\nc200-control\node_modules\ajax-request** and replace **index.js** by the one from my fork.

# Usage
First get the nc200 control object. 

### API
### .nc200device(config, updateCallback, getPaths = gGetDefaultPaths, getPathsArgs = gGetDefaultPathArgs)
* {object} ``config`` required    
* {function} ``updateCallback`` required
* {array} ``getPaths`` optional
* {object} ``getPathsArgs`` optional | required depending on ``getPaths`` content

``config`` Contains the connection parameters with the NC200 throug it's web interface (se the example below).

``updateCallback`` This function will be called with the reply of every request or with an error. It will retourn 2 objects;
``path`` and ``data``. Path will match with ``path`` on the ``.updateRequest(path,data)`` call, and ``data`` will contain the reply object from NC200 Camera. Paths are related to .fcgi paths that are used to comunicate with the NC200 Camera with AJAX requests.
Note that some control paths can be fired a part of .fcgi ones:
* **syncData** -> Notifies the initial syncronization (the contents of ``getPaths``) quewe.
* **loginError** -> Notifies an error with login step.
* **ajaxError** -> Notifies an AJAX error.

``getPaths`` contains the initial (automatic) calls to perform when first connectiong to NC200 Camera. Note that this hapens after a succesfull ``login`` attempt on the NC200 Camera. Then every call is performed sequentially and, if succesfull, the ``updateCallback`` call will be done for every .fcgi path in the list. This will happen also for the ``login`` request.

Some of these .fcgi paths need to send specific data within the request. These specific data must be passed as ``getPathsArgs`` object in order to provide the proper data on the AJAX calls. As an example **getvideoctrls** path needs to add some specific data so;

'''js
const myPaths = ["getvideosetting", "getvideoctrls", "..."];
const myPathArgs = {getvideoctrls:{all:"any value"}};
'''

Note that all .fcgi paths are used without **.fcgi** extension. This is appended automatically before make the request.

### .updateRequest(path,data)
* {string} ``path`` required    
* {object} ``data`` optional, depends on the request path

``path`` One .fcgi path as request. 

``data`` The related object data. The object definition can be obtained directly from NC200 Camera using the .fcgi path pairs. So as example, if you want to modify some 'Video Settings' first call **getvideosetting** path and use the retorned data object on the callback to modify the parameters and send it back to NC200 camera by using **setvideosetting** path.

The complete list of .fcgi paths is on the beging of the module file (index.js).

### .connect()
This function will start the initial syncronization according with the constructor data.

On the following example the module is used to enable or disable the email notification, when using the motion control feature on the NC200 Camera. You can get additional references from https://github.com/oskrs111/node-nc200-control that uses the previous version of this module.

``` js
const config = {
	ip:"192.168.XXX.XXX",
	user:"admin", 
	password:"admin"
}

const nc200 = require('nc200-control');
const device = new nc200.nc200device(config, deviceCallback,['smtp_and_ftp_load']);
device.connect(); //Start the data syncronization...

let cnt = 0;
function deviceCallback(path, data){
	obj = JSON.parse(data);
	console.log('callback receive->',path, data);
	switch(path)
	{
		case 'smtp_and_ftp_load':
			switch(process.argv[2])
			{
				case '-e':
					obj.smtp_is_enable = '1';
					obj.ftp_mode = 'MQ==';
					device.updateRequest('smtp_and_ftp_save',obj);
					break;
					
				case '-d':
					obj.smtp_is_enable = '0';
					obj.ftp_mode = 'MQ==';
					device.updateRequest('smtp_and_ftp_save',obj);
					break;					
			
				default:
					console.log('error: Missing call parameter "-e" | "-d"');
					process.exit(100);
					break;
			}							
			break;
		
		case 'smtp_and_ftp_save':
			console.log('Motion detection state updated succesfully!');
			process.exit(0);
			break;
		
		case 'ajaxError':
		case 'loginError':
			console.log('Error', path);
			process.exit(1);
		default:
		break;
		
	}
}
```

