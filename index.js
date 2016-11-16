/**
 * GPS grab and store:
 * @param {Object} tdx Api object.
 * @param {Object} output functions.
 * @param {Object} packageParams of the databot.
 */

function saveAndUpdate(dataArray,Index,timestampArray,timestamp,packageParams,cb){
   "use strict"
  let options = {
    string:true,
    local: false
  }
  let val = dataArray[Index];
  try{
        fs.readdirSync(path.join(__dirname,String(val.ID)+"-imgs"));
      }catch(e){
        //console.log(e.errno);
        if(e.errno == -2){
          fs.mkdirSync(path.join(__dirname,String(val.ID)+"-imgs"));
        }
      }
  var fileName = val.ID+"-"+timestamp+"-"+"img.jpg";
  var pathName = path.join(__dirname,path.join(String(val.ID)+"-imgs",fileName));
  base64.encode(val.src,options,(error,result) => {
    if(error){
      output.debug(error);
      cb(error,null,null);    
    }else{
      var cameraObj = {
          ID:val.ID,
          DictIndex:timestampArray.length>(packageParams.imgLength-1)?(packageParams.imgLength-1):timestampArray.length,
          timestamp:timestamp
      };
      if(timestampArray.length >= packageParams.imgLength){
            var unlinkIndex = timestampArray[0];
            timestampArray.shift();
            output.debug("timestampArray length is"+timestampArray.length);
            if(unlinkIndex != undefined){
              fs.unlinkSync(path.join(__dirname,path.join(String(val.ID)+"-imgs",String(val.ID)+"-"+unlinkIndex+"-img.jpg")));
            }
          }
      fs.writeFileSync(pathName,result,{encoding:"base64"});
      cameraArray.push(cameraObj);
      if(Index >= 126){
        cb(null,cameraObj,false);
        cameraArray = [];
      }else{
        saveAndUpdate(dataArray,Index+1,timestampArray,timestamp,packageParams,cb);
      }
    }
  })
}

function GrabHighway(tdxApi,output,packageParams){
    "use strict"
  let options = {
    string:true,
    local: false
  }
  var complate = false;
  var timer = null;
  //fs.rmdirSync(path.join(fileStorePath,"*-imgs"));
  var req = function(cb){
    /*
      array timestamp each time req() is called
     */
    let timestamp = Date.now();
  
    tdxApi.getDatasetData(packageParams.cameraTable, null, null, null,(err,response) => {
      if(err){
        output.debug(err);
        cb(err);
      }else{
          output.debug("Retrived data length is "+response.data.length);
          saveAndUpdate(response.data,0,timestampArray,timestamp,packageParams,function(err,cameraObj,next){
            if(err){
              output.debug(err);
            }else{
              if(next === false && next !== null && cameraObj !== null){
                timestampArray.push(timestamp);
                output.debug("update dataset with data length is "+ cameraArray.length);
                output.debug(tdxApi.updateDatasetDataAsync(packageParams.cameraLive,cameraArray,true));
                cb(null)
              }
            }
          })
        }
      })
  }
  var computing = false;

  timer = setInterval(() => {
    if(!complate){
      complate = true
      req(function(err){
        complate = false;
      })
    }
  },packageParams.timerFrequency);
}

/**
 * Main databot entry function:
 * @param {Object} input schema.
 * @param {Object} output functions.
 * @param {Object} context of the databot.
 */
function databot(input, output, context) {
    "use strict"
    output.progress(0);

    var tdxApi = new TDXAPI({
        commandHost: context.commandHost,
        queryHost: context.queryHost,
        accessTokenTTL: context.packageParams.accessTokenTTL
    });

    Promise.promisifyAll(tdxApi);
    
    const restify = require('restify');

    const server = restify.createServer();

    server.use(restify.acceptParser(server.acceptable));
    server.use(restify.queryParser());
    server.use(restify.bodyParser());

    server.get("/",function(req,res,next){
      res.send("localhost:3003");
    })

    server.get('/img/:folder/:timestampIndex', function (req, res, next) {

      var folderName = req.params.folder;
      var timestampValue = timestampArray[req.params.timestampIndex];
      output.debug("length of timestampArray is "+timestampArray.length);
      output.debug(timestampValue);
      if(timestampValue){
        var fileName = folderName+"-"+timestampValue+"-img.jpg";
        var filePath = path.join(__dirname,path.join(folderName+"-imgs",fileName));

        output.debug("get file %s",filePath);

        var readStream = fs.createReadStream(filePath,{encoding:"base64"});
        var stat = fs.statSync(filePath);
        var imgfile = new Buffer(fs.readFileSync(filePath),"base64");
        var sendObj = {
          ID:folderName,
          timestamp:timestampValue,
          base64String: imgfile
        }
        res.writeHead(200, {
          'Content-Type':'application/json',
          'Content-Length': JSON.stringify(sendObj).length     
        });
        res.end(JSON.stringify(sendObj));
      }else{
        res.end("NO IMAGE");
      }
      //output.debug(readStream);
      //readStream.pipe(res);
    });

    server.listen(context.instancePort);

    tdxApi.authenticate(context.shareKeyId, context.shareKeySecret, function (err, accessToken) {
        if (err) {
            output.debug("%s", JSON.stringify(err));
            process.exit(1);
        } else {
            GrabHighway(tdxApi, output, context.packageParams);
        }
    });
}


var request = require("request-promise");
var TDXAPI = require("nqm-api-tdx");
var _ = require("lodash");
var base64 = require("node-base64-image");
var fs = require("fs");
var Promise = require("bluebird");
var path = require("path");
var sync = require('synchronize');
var cameraArray = [];
var timestampArray = [];

// var tdxAPI = new TdxApi(TDXconfig);
// Promise.promisifyAll(tdxAPI);


if (process.env.NODE_ENV == 'test') {
    // Requires nqm-databot-trafficgrab.json file for testing
    input = require('./databot-test.js')(process.argv[2]);
} else {
    // Load the nqm input module for receiving input from the process host.
    input = require("nqm-databot-utils").input;
}

// Read any data passed from the process host. Specify we're expecting JSON data.
input.pipe(databot);
