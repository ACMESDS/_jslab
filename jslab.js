// UNCLASSIFIED

/**
@class JSLAB
@requires crypto
@requires glwip
@requires liegroup 
@requires mathjs
@requires digitalsignals
@requires nodehmm
@requires node-svd
@requires jsbayes
@requires recurrentjs
@requires gamma
@requires expectation-maximization
@requires multivariate-normal
@requires newton-raphson
 
@requires enum
@requires geohack
@requires atomic
 */

var
	FS = require("fs");

var 														// Totem modules
	ENUM = require("enum"),
	Copy = ENUM.copy,
	Each = ENUM.each,
	Log = console.log;

var LAB = module.exports = {  
	libs: {
		require: function (pk) {
			console.log("jslab blocked package require");
		},
		
		LM: require("./mljs/node_modules/ml-levenberg-marquardt"),
		ML: require("./mljs/node_modules/ml-matrix"),
		HACK: require("geohack"),
		ME: require('mathjs'),
		LWIP: require('glwip'),
		CRYPTO: require('crypto'),
		DSP: require('digitalsignals'),
		GAMMA: require("gamma"),
		//RAN: require("randpr"),  // added by debe to avoid recursive requires
		//SVD: require("node-svd"),
		//RNN: require("recurrentjs"),
		BAYS: require("jsbayes"),
		MLE: require("expectation-maximization"),
		MVN: require("multivariate-normal"),
		VITERBI: require("nodehmm"),
		ZETA: require("riemann-zeta"),
		LOG: console.log,
		JSON: JSON,
		
		NRAP: require("newton-raphson"),
			// require("./math/modified-newton-raphson"),
		
		FLUSH: {
			bulk: function flush(ctx,rec,recs) { 
				return false;
			},

			discard: function flush(ctx,rec,recs) { 
				return true;
			},

			byStep: function flush(ctx,rec,recs) { 
				//LOG( rec.t, recs.length ? recs[0].t : -1);
				return recs.length ? rec.t > recs[0].t : false;
			},

			byDepth: function flush(ctx,rec,recs) {
				return recs.length < 1;
			}
		},
		
		GET: {  // event getters
			byStep: function (ctx,cb) {
				LIBS.GET.load( ctx._Events, LIBS.FLUSH.byStep, ctx, cb);
			},
			byDepth: function (ctx,cb) {
				LIBS.GET.load( ctx._Events, LIBS.FLUSH.byDepth, ctx, cb);
			},
			bulk: function (ctx,cb) {
				LIBS.GET.load( ctx._Events, LIBS.FLUSH.bulk, ctx, cb);
			},
			discard: function (ctx,cb) {
				LIBS.GET.load( ctx._Events, LIBS.FLUSH.discard, ctx, cb);
			},
			load: function (evs, flush, ctx, cb) {  // get events via flush (null=bulk load) then callback cb(events) or cb(null) at end

				function feed(recs, cb) {
					//Log("flushing",recs.length);
					cb( recs );
					recs.length = 0;
				}				

				//var load = ctx._Load || [];

				if ( evs.constructor == String ) 
					/*
					if ( load.startsWith("/") )
						LAB.fetcher( load, null, function (recs) {
							if ( recs ) 
								if (flush) {
									recs.each( function (n,rec) {
										if ( flush(ctx, rec, recs) ) feed(recs,cb);
										recs.push(rec);
									});
									if ( recs.length ) feed(recs,cb);
									cb(null);
								}
							
								else {
									feed(recs,cb);
									cb(null);
								}
							
							else
								cb(null);
						});

					else 
					*/
					LAB.thread( function (sql) {
						var recs = [];

						if ( flush )
							sql.forEach( "GET", evs , [], function (rec) {  // feed recs to flusher
								if ( flush(ctx, rec, recs) ) feed(recs, cb);
								recs.push(rec);
							}).onEnd( function () {
								if ( recs.length ) feed(recs, cb);
								cb( null );
							});

						else
							sql.forAll( "GET", evs, [], function (recs) {  // no flusher needed
								feed(recs, cb);
								cb( null );
							});

					});

				else {
					if ( flush ) {
						var recs = [];			
						evs.forEach( function (rec) { // feed recs
							if ( flush(ctx, rec, recs) ) feed(recs, cb);
							recs.push(rec);
						});
						if ( recs.length ) feed( recs, cb );
						cb( null );
					}

					else {
						if ( load.length ) feed(load, cb);
						cb( null );
					}
				}

			}
		},
		
		DET: {
			train: function (ctx, res) { //< gen  detector-trainging ctx for client with callback to res(ctx) when completed.
				
				var detName = ctx._Plugin;
				
				LAB.thread( function (sql) {
					var vers = [0]; //ctx.Overhead ? [0,90] : [0];
					var labels = ctx.Labels.split(",");

					// train classifier
					//	`python ${ENV.CAFENGINES}/train`

					// train locator

					labels.each(function (n,label) {

						var posFilter = "digit +" + label,
							newFilter = "digit -" + label;

						sql.query(		// lock proofs
							"START TRANSACTION", 
							function (err) {	

						sql.query( 		// allocate positives to this ctx
							"UPDATE app.proofs SET ? WHERE ? AND ?",
							[{posLock:detName}, {cat:"digit"}, {label:label}],
						//	"UPDATE proofs SET ? WHERE MATCH (label) AGAINST (? IN BOOLEAN MODE) AND enabled",
						//	[{posLock:detName},posFilter], 
							function (err) {

						sql.query(		// allocate negatives to this ctx
							"UPDATE app.proofs SET ? WHERE ? AND NOT ?",
							[{negLock:detName}, {cat:"digit"}, {label:label}],
						//	"UPDATE proofs SET ? WHERE MATCH (label) AGAINST (? IN BOOLEAN MODE) AND enabled",
						//	[{negLock:detName},negFilter], 
							function (err) {

						sql.query(
							"SELECT * FROM app.proofs WHERE ? LIMIT 0,?",		// get allocated positives
							[{posLock:detName},ctx.MaxPos],
							function (err,posProofs) {

						sql.query(								// get allocated negatives
							"SELECT * FROM app.proofs WHERE ? LIMIT 0,?",
							[{negLock:detName},ctx.MaxNeg],
							function (err,negProofs) {

						sql.query(			// end proofs lock.
							"COMMIT", 
							function (err) { 

						Trace("PROOF ",[posProofs.length,negProofs.length], sql);

						if (posProofs.length && negProofs.length) {	// must have some proofs to execute ctx

							var	
								posDirty = posProofs.sum("dirty"),
								negDirty = negProofs.sum("dirty"),
								totDirty = posDirty + negDirty,
								totProofs = posProofs.length + negProofs.length,
								dirtyness = totDirty / totProofs;

							Trace('DIRTY', [dirtyness,ctx.MaxDirty,posDirty,negDirty,posProofs.length,negProofs.length], sql);

							sql.query("UPDATE detectors SET ? WHERE ?",[{Dirty:dirtyness},{ID:ctx.ID}]);

							if (dirtyness >= ctx.MaxDirty) {		// sufficiently dirty to cause ctx to execute ?

								sql.query("UPDATE proofs SET dirty=0 WHERE least(?)",{posLock:detName,negLock:detName});

								vers.each( function (n,ver) {  		// train all detector versions

									var det = FLEX.clone(ctx);

									det.Path = "det"+ver+"/"+label+"/"; 		// detector training results placed here
									det.DB = "../db"+ver;						// positives and negatives sourced from here relative to ENV.DETS
									det.posCount = posProofs.length;
									det.negCount = negProofs.length;
									det.posPath = det.Path + "positives.txt"; 	// + ENV.POSITIVES + (false ? jobFolder + ".positives" : det.PosCases + ".jpg");  		// .positives will disable auto-rotations
									det.negPath = det.Path + "negatives.txt"; 	// + ENV.NEGATIVES + jobFolder + ".negatives";
									det.vecPath = det.Path + "samples.vec";
									det.posLimit = Math.round(det.posCount * 0.9); 	// adjust counts so haar trainer does not exhaust supply
									det.negLimit = Math.round(det.negCount * 1.0);

									det.link = det.Name.tag("a",{href:"/swag.view?goto=Detectors"}) + " " + det.posLimit + " pos " + det.negLimit + " neg";
									det.name = det.Name;
									det.client = log.client;
									det.work = det.posCount + det.negCount;

									Trace(`TRAIN ${det.Name} v${ver}`, sql);

									var Execute = {
										Purge: "rm -rf " + det.Path,
										Reset: "mkdir -p " + det.Path,

										// ************* NOTE 
										// ****** Must pass bgcolor and bgthres as parms too - positive dependent
										// ****** so must be dervied from image upload tags
										Resample: 
											`opencv_createsamples -info ${det.posPath} -num ${det.posCount} -w ${det.Width} -h ${det.Height} -vec ${det.vecPath}`,
											//"opencv_createsamples -info $posPath -num $posCount -w $Width -h $Height -vec $Data/samples.vec",
											//"opencv_createsamples $Switch $posPath -bg $negPath -vec $Vector -num $Samples -w $Width -h $Height -bgcolor 112 -bgthresh 5 -maxxangle $xRotate -maxyangle $yRotate -maxzangle $zRotate -maxidev $ImageDev",

										Train: 
											`opencv_traincascade -data ${det.Path} -vec ${det.vecPath} -bg ${det.negPath} -numPos ${det.posLimit} -numNeg ${de.negLimit} -numStages ${det.MaxStages} -w ${det.Width} -h ${det.Height} -featureType LBP -mode BASIC`
											//"opencv_traincascade -data $Cascade -bg $negPath -vec $Vector -numPos $Positives -numNeg $Negatives -numStages $MaxStages -precalcValBufSize 100 -precalcIdxBufSize 100 -featureType HAAR -w $Width -h $Height -mode BASIC -minHitRate $MinTPR -maxFalseAlarmRate $MaxFPR -weightTrimRate $TrimRate -maxDepth $MaxDepth -maxWeakCount $MaxWeak"										
									};

									Trace((det.Execute||"").toUpperCase()+" "+det.name, sql);

									/**
									* Training requires:
									*  	SAMPLES >= POSITIVES + (MAXSTAGES - 1) * (1 - STAGEHITR) * POSITIVES + NEGATIVES
									* that is:
									*	POSITIVES <= (SAMPLES-NEGATIVES) / (1 + (MAXSTAGES-1)*(1-STAGEHITR))
									*
									* Actual STAGES (from training log) <= MAXSTAGES 
									* Desired HITRATE = STAGEHITR ^ MAXSTAGES --> STAGEHITR ^ (Actual STAGES)
									* Desired FALSEALARMRATE = STAGEFAR ^ MAXSTAGES --> STAGEFAR ^ (Actual STAGES)
									*
									* The samples_zfullN100 file will always contain $NEGATIVES number of negative images.
									*/

									switch (det.Execute.toLowerCase()) {
										case "purge": 
										case "clear":
											//sql.jobs().insert( "purge", Execute.Purge, det);
											break;

										case "reset":
										case "retrain":

											if (true) {						// gen training positives
												var list = []; 

												posProofs.each( function (n,proof) {
													//list.push(proof.Name + " 1 0 0 " + (proof.Width-1) + " " + (proof.Height-1) );
													list.push([det.DB+"/"+proof.name, 1, proof.left, proof.top, proof.width, proof.height].join(" "));
												});

												FS.writeFileSync(
													`./public/dets/${det.posPath}`, 
													list.join("\n")+"\n","utf-8");
											}

											if (true) {					 	// gen training negatives
												var list = [];

												negProofs.each( function (n,proof) {
													list.push(det.DB+"/"+proof.name);
												});

												FS.writeFileSync(
													`./public/dets/${det.negPath}`, 
													list.join("\n")+"\n","utf-8");
											}

											if (true)
												sql.jobs().insert( "reset", Execute.Reset, det, function () {
													sql.jobs().insert( "sample", Execute.Resample, det, function () {
														sql.jobs().insert( "learn", Execute.Train, det, function () {
															if (res) res(det);
														});
													});
												});

											break;

										case "resample":

											sql.jobs().insert( "sample", Execute.Resample, det, function () {
												sql.jobs().insert( "learn", Execute.Train, det, function () {
													if (res) res(det);
												});
											});
											break;

										case "transfer":

											sql.jobs().insert( "learn", Execute.Train, det, function () {
												if (res) res(det);
											});
											break;

										case "baseline":
											break;

										case "run":
										case "detect":

											if (FLEX.HACK)
											FLEX.HACK.workflow(sql, {
												detName: det.Name.replace(/ /g,"_"),
												chanName: det.Channel,
												size: det.Feature,
												pixels: det.Pixels,
												scale: det.Pack,
												step: det.SizeStep,
												detects: det.Hits,
												infile: det.infile,
												outfile: "/rroc/data/giat/swag/jobs",
												ctx: {
													client: req.client,
													class: "detect",
													name: det.Name,
													link: det.Name.tag("a",{href:"/swag.view?goto=Detectors"}),
													qos: req.profile.QoS,
													priority: 1
												}									
											});

											break;
									}

								});

							}
						}

						}); // commit proofs
						}); // select neg proofs
						}); // select pos proofs
						}); // update neg proofs
						}); // update pos proofs
						}); // lock proofs

					});	// labels
				}); ///sql thread
			}
		}
		
	},
	
	fetcher: null, //function () {},	// reserved for http fetcher
	thread: null,
	
	config: function (opts) {
		if (opts) Copy(opts,LAB);
	
		/*
		if (mysql = LAB.mysql)
			DSVAR.config({   // establish the db agnosticator 
				mysql: Copy({ 
					opts: {
						host: mysql.host,   // hostname 
						user: mysql.user, 	// username
						password : mysql.pass,				// passphrase
						connectionLimit : mysql.sessions || 100, 		// max simultaneous connections
						//acquireTimeout : 10000, 			// connection acquire timer
						queueLimit: 0,  						// max concections to queue (0=unlimited)
						waitForConnections: true			// allow connection requests to be queued
					}
				}, mysql)
			}, function (sql) {
				LOG("jslan est mysql");
				sql.release();
			});
		*/
	}
	
};

//=========== Extend matlab emulator

var 
	SQL = null, //< defined by engine
	LIBS = LAB.libs,
	LWIP = LIBS.LWIP,
	LOG = LIBS.LOG,
	ME = LIBS.ME,
	ML = LIBS.ML;

ME.import({
	exec: function (ctx,code) {
		var emctx = {};

		for (key in ctx) {
			val = ctx[key];
			emctx[key] = (val && val.constructor == Array) 
					? emctx[key] = ME.matrix(val)
					: val;
		}

		ME.eval(code, emctx);

		for (key in emctx) {
			val = emctx[key];
			ctx[key] = (val && val._data)
				? val._data
				: val;
		}
	},
		
	isEqual: function (a,b) {
		return a==b;
	},
	
	svd: function (a) {
		var svd = new ML.SVD( a._data );
		Log(svd);
	},
	
	evd: function (a) {
		//Log("evd", a._data);
		var evd = new ML.EVD( a._data );  //, {assumeSymmetric: true}
		//Log("evd", evd.d);
		return {values: ME.matrix(evd.d), vectors: ME.matrix(evd.V)}; 
	},
		
	disp: function (a) {
		console.log(a);
	}
});

// UNCLASSIFIED
