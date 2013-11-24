var app = null;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    
    // kanbanField : "c_KanbanState",
    // kanbanField : "c_KanbanBoardOperation",
    // finalValue : "Done",
    
    launch: function() {
        //Write app code here
        console.log("launch");
        app = this;
        // this.startDate = moment().startOf('month').toISOString();
        this.startDate = moment().subtract('month',3).toISOString();
        this.createUI();

        var panel = Ext.create('Ext.container.Container', {
            itemId : 'panel',
            title: 'Hello',
            width: 800,
            height: 600,
            html: '<p>World!</p>'
        });

        this.add(panel);
        var p = this.down("#panel");
        app.jqPanel = "#"+p.id;



    },

    run : function () {
        
        async.waterfall([   
            app.getCompletedItems, 
            app.getSnapshotsForCompletedItems,
            app.prepareSnapshots,
            app.pivotData
            // app.processSnapshots,
            // app.summarizeResults
            ], 
            function( err, results ) {
                console.log( "whole mess of results ", results );
            }
        );
    },
    
    createUI : function() {
        
        var createButton = function() {
            if (app.goButton)
                app.goButton.destroy();
            app.goButton = Ext.create("Rally.ui.Button", {
                margin : 5,
                height : 20,
                text : "Go",
                handler: function() {
                    console.log("fieldCombo:",app.fieldCombo.getValue());
                    console.log("valueCombo:",app.valueCombo.getValue());
                    app.kanbanField = app.fieldCombo.getValue()
                    app.finalValue  = app.valueCombo.getValue()
                    app.run();
                }
            });
            app.boxcontainer.add(app.goButton);
            
        };
        
        var createValueCombo = function(valuefield) {
            if (app.valueCombo)
                app.valueCombo.destroy();
            
            app.valueCombo = Ext.create("Rally.ui.combobox.FieldValueComboBox", {
                padding : 5,
                
                stateful : true, stateId : "Rally.ui.combobox.FieldValueComboBox",
                model: 'UserStory',
                field: valuefield,
                listeners : {
                    ready : function(t) {
                        console.log("value ready",t.getValue());
                        if (t.getValue()!=="")
                            createButton();
                    },
                    select : function(a,selected,c) {
                        console.log("selected",selected[0].get("value"));
                        createButton();
                    }
                }
            });
            return app.valueCombo;
        };
        
        app.fieldCombo = Ext.create('Rally.ui.combobox.FieldComboBox', {
            padding : 5,
            stateful : true, stateId : "Rally.ui.combobox.FieldComboBox",
            model: 'UserStory',
            listeners : {
                ready : function(t,e) {
                    createValueCombo(t.getValue());
                    app.boxcontainer.add(app.valueCombo);
                },
                select : function(a,selected,c) {
                    console.log("selected",selected);
                    createValueCombo(selected[0].get("value"));
                    if (app.goButton) app.goButton.destroy();
                    app.boxcontainer.add(app.valueCombo);
                }
            }
        });
        
        app.boxcontainer = Ext.create('Ext.container.Container', {
            itemId : "container",
            layout: { type: 'hbox'},
            width: 400,
            border: 1,
            style: {borderColor:'#000000', borderStyle:'solid', borderWidth:'1px'},
            // padding : 5
        });
        app.boxcontainer.add(app.fieldCombo);
        this.add(app.boxcontainer);
        
    },
    
    // reads the snapshots for items that have been completed since the specified start date.
    getCompletedItems : function( callback ) {
        
        var that = this;

        var fetch = ['ObjectID','_TypeHierarchy','_PreviousValues','PlanEstimate','Project',app.kanbanField];
        var hydrate = ['_TypeHierarchy',app.kanbanField];
        
        var find = {
                '_TypeHierarchy' : { "$in" : ["HierarchicalRequirement","Defect"]} ,
                '_ProjectHierarchy' : { "$in": app.getContext().getProject().ObjectID },
                'Children' : { "$exists" : false}
        };
        find[app.kanbanField] =  app.finalValue;
        find["_PreviousValues."+app.kanbanField] =  {"$ne" : "null" };
        find["_ValidFrom"] = { "$gte" : app.startDate };

        var storeConfig = {
            find : find,
            autoLoad : true,
            pageSize:1000,
            limit: 'Infinity',
            fetch: fetch,
            hydrate: hydrate,
            listeners : {
                scope : this,
                load: function(store, snapshots, success) {
                    console.log("success",success);
                    console.log("completed snapshots:", snapshots.length);
                    console.log("unique completed   :", _.uniq(_.map(snapshots,function(s){return s.get("ObjectID");})).length);
                    callback(null,snapshots);
                }
            }
        };

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
        
    },

    // will process the snapshots adding additional elements
    prepareSnapshots : function(completedItems, snapshots,callback) {

        _.each(snapshots, function(s) {
            // set the month
            var ci = _.find(completedItems,function(c) { return c.get("ObjectID") === s.get("ObjectID");});
            var month = moment(ci.get("_ValidFrom")).format ("MMM YYYY");
            s.set("Month",month);
            s.set("Size",ci.get("PlanEstimate"));
        });

        callback( null, completedItems, snapshots );

    },

    pivotData : function( completedItems, snapshots, callback ) {

        var addCommas = function(nStr) {
            var rgx, x, x1, x2;
            nStr += '';
            x = nStr.split('.');
            x1 = x[0];
            x2 = x.length > 1 ? '.' + x[1] : '';
            rgx = /(\d+)(\d{3})/;
            while (rgx.test(x1)) {
              x1 = x1.replace(rgx, '$1' + ',' + '$2');
            }
            return x1 + x2;
          };

        var numberFormat = function(sigfig, scaler) {
            if (sigfig == null) {
              sigfig = 3;
            }
            if (scaler == null) {
              scaler = 1;
            }
            return function(x) {
              if (x === 0 || isNaN(x) || !isFinite(x)) {
                return "";
              } else {
                return addCommas((scaler * x).toFixed(sigfig));
              }
            };
        };

        var cycleTime = function() {
          return function(x,y,z) {
            return {
              recs : [],
              push: function(record) {
                this.recs.push(record);
                // return this.count++;
                return this.recs.length;
              },
              value: function(value) {
                var ct = (calcCyleTime(this.recs));
                return _.mean( _.pluck(ct,"ticks"));
              },
              format: numberFormat(0),
              label: "cycleTime"
            };
          };
        };

        var calcCyleTime = function( snapshots ) {
                var that = this;
                var granularity = 'day';
                var tz = 'America/New_York';
                
                var config = { //  # default work days and holidays
                    granularity: granularity,
                    tz: tz,
                    validFromField: '_ValidFrom',
                    validToField: '_ValidTo',
                    uniqueIDField: 'ObjectID'
                };
                
                var start = moment().dayOfYear(0).toISOString();
                var end =   moment().toISOString();
                tisc = new window.parent._lumenize.TimeInStateCalculator(config);
                tisc.addSnapshots(snapshots, start, end);
                var results = tisc.getResults();
                // callback(null,results);
                return results;
        };



        var data = _.map(snapshots,function(s) { 
            return s.data;
        });

        console.log("data",data);
        console.log("app.kanbanField",app.kanbanField);

        $(app.jqPanel).pivotUI(

            data,                    
            {
                aggregators : { cycleTime : cycleTime },
                rows: [app.kanbanField],
                cols: ["Project"],
                hiddenAttributes : ["PlanEstimate", "ObjectID","_TypeHierarchy","_UnformattedID","_ValidFrom","_ValidTo"]
            }
        );
        
        callback( null, completedItems, snapshots );
    },

    readSnapshots : function( config, callback) {
        console.log("reading page of snapshots...");
         var storeConfig = {
            find : config.find,
            autoLoad : true,
            pageSize:1000,
            limit: 'Infinity',
            fetch: config.fetch,
            hydrate: config.hydrate,
            listeners : {
                scope : this,
                load: function(store, snapshots, success) {
                    callback(null,snapshots);
                }
            }
        };
        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
    },
    
    getSnapshotsForCompletedItems : function(completedItems,callback) {

        var that = this;
        var completedOids = _.uniq( _.pluck( completedItems, function(c) { return c.get("ObjectID"); } ));        
        console.log("oids",completedOids.length);

        var oidsArrays = [];
        var i,j,chunk = 200;
        for (i=0, j=completedOids.length; i<j; i+=chunk) {          
            oidsArrays.push(completedOids.slice(i,i+chunk));
        }
        console.log("oidsArrays",oidsArrays);

        var configs = _.map( oidsArrays, function(oArray) {
            return {
                fetch : ['_UnformattedID','ObjectID','_TypeHierarchy','PlanEstimate', 'ScheduleState',app.kanbanField],
                hydrate : ['_TypeHierarchy','ScheduleState',app.kanbanField],
                find : {
                    '_TypeHierarchy' : { "$in" : ["HierarchicalRequirement","Defect"]} ,
                    '_ProjectHierarchy' : { "$in": app.getContext().getProject().ObjectID }, 
                    'ObjectID' : { "$in" : oArray }
                }
            }
        })

        async.mapSeries( configs, app.readSnapshots, function(err,results) {

            var snapshots = [];
            _.each(results,function(r) {
                snapshots = snapshots.concat(r);
            });
            console.log("total snapshots",snapshots.length);
            callback(null,completedItems,snapshots)

        });

        // var fetch = ['_UnformattedID','ObjectID','_TypeHierarchy','PlanEstimate', 'ScheduleState',app.kanbanField];
        // var hydrate = ['_TypeHierarchy','ScheduleState',app.kanbanField];
        // var find = {
        //     '_TypeHierarchy' : { "$in" : ["HierarchicalRequirement","Defect"]} ,
        //     '_ProjectHierarchy' : { "$in": app.getContext().getProject().ObjectID } , 
        //     'ObjectID' : { "$in" : completedOids }
        // };

        // we need to slice the list of oids into small groups, say 200

        // var storeConfig = {
        //     find : find,
        //     autoLoad : true,
        //     pageSize:2000,
        //     limit: 'Infinity',
        //     fetch: fetch,
        //     hydrate: hydrate,
        //     listeners : {
        //         scope : this,
        //         load: function(store, snapshots, success) {
        //             console.log("success",success);
        //             console.log("success",snapshots.length);
        //             // console.log("snapshots for completed items:",JSON.stringify(snapshots));
        //             callback(null,completedItems,snapshots);
        //         }
        //     }
        // };

        // var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
        
        // snapshotStore.load({
        //     params: {
        //         compress: true,
        //         removeUnauthorizedSnapshots: true
        //     },
        //     callback: function(records) {
        //         console.log("records",records.data.items);
        //         that.processSnapshots(records.data.items);
        //     }
        // });
    }, 
    
    summarizeResults : function( stateResults, callback ) {
      
        _.each(stateResults, function(result) {
            
            var resultTicks = _.pluck(result.results, function(r) { return r.ticks; });
            result.min = _.min( resultTicks ) ;
            result.max = _.max( resultTicks );
            result.avg = _.reduce(resultTicks, function(memo, num) {
        		    return memo + num;
                }, 0) / resultTicks.length;
                
            result.median = _.median( _.sortBy(resultTicks) , function(r) { return r;});
            result.mean   = _.mean( resultTicks , function(r) { return r;});
            result.ticks = _.sortBy(resultTicks);
        });
        callback(null,stateResults);
        
    },
    
    processSnapshots : function(completedItems,snapshots,callback) {
        var groupedByState = _.groupBy(snapshots, function(s) { return s.get(app.kanbanField);});
        console.log("grouped",groupedByState);
        var stateSnapshots = _.map( _.keys(groupedByState), function(state) { return { state : state, snapshots : groupedByState[state]}; });
        async.map(stateSnapshots, app.calcCyleTimeForState, function(err,results) {
            _.each(results, function(result,i) {
                stateSnapshots[i].results = result; 
            });
            // that.reportResults(stateSnapshots);
            callback(null,stateSnapshots);
        });
    },
    
    calcCyleTimeForState : function( stateSnapshots, callback ) {
        var that = this;
        var snapshots = _.pluck(stateSnapshots.snapshots,function(s) { return s.data;});
        var granularity = 'day';
        var tz = 'America/New_York';
        
        var config = { //  # default work days and holidays
            granularity: granularity,
            tz: tz,
            validFromField: '_ValidFrom',
            validToField: '_ValidTo',
            uniqueIDField: 'ObjectID'
        };
        
        var start = moment().dayOfYear(0).toISOString();
        var end =   moment().toISOString();
        tisc = new window.parent._lumenize.TimeInStateCalculator(config);
        tisc.addSnapshots(snapshots, start, end);
        var results = tisc.getResults();
        callback(null,results);
    },

});
