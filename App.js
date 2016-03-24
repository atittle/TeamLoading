Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {

        var app = this;

        app.add({
            xtype: 'rallyiterationcombobox',
            fieldLabel: 'Choose Iteration:',
            maxWidth: 600,
            width: 600,
            id: 'iterCbx',

            listeners: {
                select: app._iterationSelect,
                ready: app._iterationLoad,
                scope: app
            }
        });
    },

    tableStore: null,
    userPanel: null,

    _iterationSelect: function() {
        userPanel.destroy();
        tableStore.destroy();
        this._iterationLoad();
    },

    _iterationLoad: function() {

        var app = this;

        var currentContext = Rally.environment.getContext();

        //Get the current user and workspace
        var user = currentContext.getUser();
        var workspace = currentContext.getWorkspace();
        var project = currentContext.getProject();
//debugger;

        //Create a store to hold the stuff I want

        tableStore = Ext.create('Ext.data.Store', {
            storeId: 'userLoad',
            fields: ['UserName', 'Ref', 'IterationCapacity', 'Planned', 'Actual', 'StatusFail'],
            proxy: {
                type: 'memory',
                reader: {
                    type: 'json',
                    root: 'users'
                }
            }
        });

        var projStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            autoLoad: true,
            fetch: true,
            filters: [
                {
                    property: 'Name',
                    value: project.Name
                }
            ],
            listeners: {
                load: function (store, data, success) {
                    var proj = data[0]; //Should only be one returned!
                    var userstore = store;

                    proj.getCollection('TeamMembers').load({
                        fetch: ['Name', 'UserName', 'FirstName', 'LastName'],
                        callback: function(records, operation, success) {

                            //Create a table for the users
                            _.each(records, function(record) {
//debugger;
                                tableStore.add( {
                                        "UserName" : record.get('FirstName') + ' ' + record.get('LastName'),
                                        "Ref" : record.get('_ref')
                                });
                            });

                            //Now add a table to the page
                            userPanel = Ext.create ('Ext.grid.Panel', {
                                title: 'Team Member Planned vs Actual Loading to-date',
                                store: tableStore,
                                width: 500,
                                columns: [
                                    { text: 'Name', dataIndex: 'UserName',  width: 140 },
                                    { text: 'Capacity', dataIndex: 'IterationCapacity', width: 79,
                                        renderer: function(capacity) {
                                            if (capacity)
                                                return Ext.String.format('{0}', capacity);
                                            else
                                                return Ext.String.format('<p style="background-color:red;color:white;text-align:center">NOT SET</p>');
                                        }
                                    },
                                    { text: 'Planned Task Hours', dataIndex: 'Planned', width: 110 },
                                    { text: 'Completed Task Hours', dataIndex: 'Actual', width: 120 },
                                    { text: 'Status', dataIndex: 'StatusFail', width: 50,
                                        renderer: function(status) {
                                            if (status)
                                                return Ext.String.format('<p style="background-color:red;color:white;text-align:center">FAIL</p>');
                                            else
                                                return Ext.String.format('<p style="background-color:green;color:white;text-align:center">OK</p>');
                                        }
                                    }
                                ]
                            });

                            app.add(userPanel);

                            //Add capacities - could use lookback to find values at
                            //start of iteration??
                            app._getUserIterationCapacities(records);

                            //Add hours already done
                            app._getUserHoursDone (records);
                        },
                        scope: app
                    });
                }
            }
        });
    },

    _checkUserStatus: function() {

        var records = userPanel.store.data.items;

        _.each(records, function (rec) {
            rec.set('StatusFail', (rec.get('Planned') + rec.get('Actual')) > rec.get('IterationCapacity'));
        });
        userPanel.store.sync();
    },

    _getUserIterationCapacities: function( members ) {

        var app = this;

        utilsStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'UserIterationCapacity',
            filters: [{ property: 'Iteration.Name', value: Ext.getCmp('iterCbx').rawValue }],
            autoLoad: 'true',
            listeners: {
                load: function(store, records, success) {

                    _.each(records, function(rec) {
                        var user = tableStore.findRecord('Ref', rec.get('User')._ref);
                        if ( user ) {
                            user.set('IterationCapacity', rec.get('Capacity'));
                            user.set('Planned', rec.get('TaskEstimates'));
                        } else {
                            //Need to log this??? It means someone is doing stuff but not a team member?
                        }
                    });
                    userPanel.store.sync(); //Clear dirty flags
                    app._checkUserStatus();

//                    debugger;
                }
            },
            fetch: ['Capacity', 'User', 'Load', 'TaskEstimates']
        });
    },

    _getUserHoursDone: function ( members ) {
        var app = this;

        _.each(members, function(member) {

            var taskStore = Ext.create('Rally.data.wsapi.Store', {
                model: 'Task',
                autoLoad: true,
                filters: [
                    {
                        property: 'Iteration.Name',
                        value: Ext.getCmp('iterCbx').rawValue
                    },
                    {
                        property: 'Owner',
                        value: member.get('_ref')
                    }
                ],
                listeners: {
                    load: function(store, records, success) {
                        var actualsTotal = 0;
                        _.each(records, function(rec) {
                            if (rec.get('TimeSpent')) actualsTotal += rec.get('TimeSpent');

                        });
                        if (records.length) {
                            var user = tableStore.findRecord('Ref', records[0].get('Owner')._ref);
                            user.set('Actual', actualsTotal);
                            app._checkUserStatus();
                        }
                    }
                }
            });

        });
    }
});
