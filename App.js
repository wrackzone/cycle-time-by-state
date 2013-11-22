var app = null;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    
    kanbanField : "c_KanbanState",
    // kanbanField : "c_KanbanBoardOperation",
    finalValue : "Done",
    
    launch: function() {
        //Write app code here
        console.log("launch");
        app = this;
        this.startDate = moment().startOf('day').toISOString();
        this.createUI();
        
        async.waterfall([   app.getCompletedItems, 
                            app.getSnapshotsForCompletedItems,
                            app.processSnapshots,
                            app.summarizeResults
                        ], 
            function( err, results ) {
                console.log( "whole mess of results ", err, results );
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
                    Ext.Msg.alert('Button', 'You clicked me');
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
                        console.log("selected",selected);
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

        var fetch = ['ObjectID','_TypeHierarchy','_PreviousValues',app.kanbanField];
        var hydrate = ['_TypeHierarchy',app.kanbanField];
        
        var find = {
                '_TypeHierarchy' : { "$in" : ["HierarchicalRequirement","Defect"]} ,
                '_ProjectHierarchy' : { "$in": app.getContext().getProject().ObjectID },
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
                    console.log("snapshots:",snapshots.length);
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
        var fetch = ['_UnformattedID','ObjectID','_TypeHierarchy','PlanEstimate', 'ScheduleState',app.kanbanField];
        var hydrate = ['_TypeHierarchy',app.kanbanField];
        var find = {
            '_TypeHierarchy' : { "$in" : ["HierarchicalRequirement","Defect"]} ,
            '_ProjectHierarchy' : { "$in": app.getContext().getProject().ObjectID } , 
            'ObjectID' : { "$in" : completedOids }
        };

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
                    console.log("snapshots for completed items:",snapshots.length);
                    callback(null,snapshots);
                }
            }
        };

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', storeConfig);
        
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
    
    processSnapshots : function(snapshots,callback) {
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
