/*
*   NOTE: This sample uses ES6 features
*/
import clientIDs from '../clientIDs.js'
import hb from './template-references.js'

// Requires jQuery and Handlebars from parent context
const $ = window.$;
const jQuery = window.jQuery;
const Handlebars = window.Handlebars;
if((typeof $ === 'undefined') ||
        (typeof jQuery === 'undefined') ||
        (typeof Handlebars === 'undefined')){
    console.error("===== PREMIUM APP ERROR ====== \n" +
                  "A required library is missing. \n" +
                  "==============================");   
}

/**
 * WizardApp class that handles everything in the App.
 * @todo Change all members to static if more appropriate
 * @todo keep track of current main module(page) to check with inner modules before they're rendered
 * @todo keep track of current status with local storage to enable resuming
 * @todo move  Handlebar renderer functions to separate module.
 * @todo Roles Creation
 */
class WizardApp {
    constructor(){
        // Reference to the PureCloud App (Client App SDK)
        this.pcApp = null;

        // PureCloud Javascript SDK clients
        this.platformClient = require('platformClient');
        this.purecloudClient = this.platformClient.ApiClient.instance;
        this.purecloudClient.setPersistSettings(true, 'premium_app');
        this.redirectUri = "https://localhost/wizard/index.html";

        // Permissions required for using the app 
        // TODO: store permissions on a separate file
        this.setupPermissionsRequired = ['admin'];

        // Prefix to add to all objects that will be added
        // (roles, groups, integrations, etc..)
        // as a result of this installatino wizard
        this.prefix = '1111';

        // JS object that will stage information about the installation.
        this.stagingArea = null;

        // Default order to prefill staging area
        this.defaultOrderFileName = 'sample-order';
        this.loadOrderFile(this.defaultOrderFileName);
    }

    /**
     * First thing that needs to be called to setup up the PureCloud Client App
     */
    _setupClientApp(){    
        // Backwards compatibility snippet from: https://github.com/MyPureCloud/client-app-sdk
        let envQueryParamName = 'pcEnvironment';
    
        if (window && window.location && typeof window.location.search === 'string' &&
            window.location.search.indexOf('pcEnvironment') >= 0) {
                this.pcApp = new window.purecloud.apps.ClientApp({pcEnvironmentQueryParam: envQueryParamName});
        } else {
            // Use default PureCloud region
            this.pcApp = new window.purecloud.apps.ClientApp();
        }
        console.log(this.pcApp.pcEnvironment);
    }


    /**
     * Authenticate to PureCloud (Implicit Grant)
     * @todo Assign default or notify user if can't determine purecloud environment
     */
    _pureCloudAuthenticate() {
        return new Promise((resolve, reject) => {
            // Authenticate through PureCloud
            this.purecloudClient.loginImplicitGrant(clientIDs[this.pcApp.pcEnvironment], 
                                    this.redirectUri, 
                                    {state: ('pcEnvironment=' + this.pcApp.pcEnvironment)})
            
            // Check user permissions
            .then(data => {
                console.log(data);

                let usersApi = new this.platformClient.UsersApi();

                let opts = {'expand': ['authorization']};

                return usersApi.getUsersMe(opts); 
            }).then(userMe => {
                console.log(userMe);

                // Show appropriate elements based on qualification of user permissions.
                if(!this.setupPermissionsRequired.every(perm => userMe.authorization.permissions.indexOf(perm) > -1)){
                    this._renderModule('not-authorized');
                }else{
                    resolve();
                }
                
            // Error handler catch all
            }).catch(err => console.log(err));
        });
    }

    /**
     * Render the Handlebars template to the window
     * @param {string} page     contains filename of handlebars file
     * @param {object} context  context oject
     * @param {string} target   ID of element HTML where rendered module will be placed
     */
    _renderModule(page, context, target) {
        context = (typeof context !== 'undefined') ? context : {}; 
        target = (typeof target !== 'undefined') ? target : 'default-module'; 

        let templateUri = 'templates/' + page + '.handlebars';
        let templateSource;
        let template;

        return new Promise((resolve, reject) => {
            // Async get the desired template file
            $.ajax({
                url: templateUri,
                cache: true
            })
            .done(data => {
                // Compile Handlebars template 
                templateSource = data;
                template = Handlebars.compile(templateSource);

                // Render html and display to the target element
                let renderedHtml = template(context);
                $('#' + target).html(renderedHtml);

                resolve();
            })
            .fail(xhr => {
                console.log('error', xhr);
                reject();
            });
        });
    }

    /**
     * Render a complete page with header and body
     * @param {Object} headerContext    contains title and subtitle for header
     * @param {Object} bodyContext      context for the body
     * @param {string} bodyTemplate     filename of template for the body section
     */
    _renderCompletePage(headerContext, bodyContext, bodyTemplate){
        // Default values
        headerContext = (typeof headerContext !== 'undefined') ? headerContext : {};
        bodyContext = (typeof bodyContext !== 'undefined') ? bodyContext : {};

        return new Promise((resolve, reject) => {
            this._renderModule(hb['root'])
            .then(() => this._renderModule(hb['header'], headerContext, 'root-header'))
            .then(() => this._renderModule(bodyTemplate, bodyContext, 'root-body'))
            .then(() => resolve())
        })
        
    }


    /**
     * Loads the landing page of the app
     */
    loadLandingPage(event){
        this._pureCloudAuthenticate()
        .then(() => {
            let organizationApi = new this.platformClient.OrganizationApi();

            // Get organization information
            return organizationApi.getOrganizationsMe()
            .then(orgData => {
                let orgFeature = orgData.features;
    
                this._renderCompletePage(
                    {
                        "title": "App Setup Wizard",
                        "subtitle": "Welcome! This Wizard will assist you in the installation, modification, or removal of the Premium App."
                    }, 
                    {
                        features: orgFeature,
                        startWizardFunction: this.loadRolesPage
                    },
                    hb['landing-page']
                )
                .then(() => {
                    $('#btn-check-installation').click($.proxy(this.loadCheckInstallationStatus, this));
                });
            });
        });
        
    }

    /**
     * Load the page to check for existing PureCloud objects
     * @todo Reminder: Get roles and groups have max 25 after query. 
     *          Get integration has max 100 before manual filter.
     */
    loadCheckInstallationStatus(event){
        this._renderCompletePage(
            {
                "title": "Checking Installation",
                "subtitle": "Check any existing PureCloud Objects that is set up by the App"
            }, 
            {
                objectPrefix: this.prefix
            },
            hb['check-installation']
        )
        .then(() => {
            $('#btn-start-wizard').click($.proxy(this.loadGroupsCreation, this));
        });

        // PureCloud API instances
        let groupsApi = new this.platformClient.GroupsApi();
        let authApi = new this.platformClient.AuthorizationApi();
        let integrationApi = new this.platformClient.IntegrationsApi();

        // Query bodies
        var groupSearchBody = {
            "query": [
            {
                "fields": ["name"],
                "value": this.prefix,
                "operator": "OR",
                "type": "STARTS_WITH"
            }
            ]
        };

        var authOpts = { 
            'name': this.prefix + "*", // Wildcard to work like STARTS_WITH 
            'userCount': false
        };

        var integrationsOpts = {
            'pageSize': 100
        }
        
        // Check existing groups
        groupsApi.postGroupsSearch(groupSearchBody)
        .then(data => {
            let group = (typeof data.results !== 'undefined') ? data.results : {};
            let context = {
                panelHeading: 'Existing Groups (' + 
                                Object.keys(group).length + ')',
                objType: 'groups',
                pureCloudObjArr: group,
                icon: 'fa-users'
            }
            this._renderModule(hb['existing-objects'],
                                context,
                                'results-group');
        }).catch(err => console.log(err));

        // Check existing roles
        authApi.getAuthorizationRoles(authOpts)
        .then(data => {
            let roles = data.entities;
            let context = {
                panelHeading: 'Existing Roles (' + 
                                Object.keys(roles).length + ')',
                objType: 'roles',
                pureCloudObjArr: roles,
                icon: 'fa-briefcase'
            }
            this._renderModule(hb['existing-objects'],
                                context,
                                'results-role');
        })
        .catch(err => console.log(err));

        // Check existing Integrations
        integrationApi.getIntegrations(integrationsOpts)
        .then(data => {
            let integrations = data.entities.filter(entity => entity.name.startsWith(this.prefix));
            let context = {
                panelHeading: 'Existing Integrations (' + 
                            Object.keys(integrations).length + ')',
                objType: 'integrations',
                pureCloudObjArr: integrations,
                icon: 'fa-cogs'
            }
            this._renderModule(hb['existing-objects'],
                                context,
                                'results-integration');
        })
        .catch(err => console.log(err));
    }

    /**
     * Stage the groups to be created.
     * Thi is the First step of the installation wizard.
     * @param {object} event 
     */
    loadGroupsCreation(event){
        this._renderCompletePage(
            {
                title: "Create groups",
                subtitle: "Groups are required to filter which members will have access to specific instances of the App."
            },
            null, hb["wizard-page"]
        )

        // Render left guide bar
        .then(() => this._renderModule(hb['wizard-group-left'], {"highlight1": true}, 'wizard-left'))
        
        //Render contents of staging area
        .then(() => this._renderModule(hb['wizard-group-content'], this.stagingArea, 'wizard-content'))
        
        //Render controls
        .then(() => this._renderModule(hb['wizard-group-control'], {}, 'wizard-control'))

        // TODO: Input Validation and Error Handling
        .then(() => {
            // If add Group Button pressed then stage the group name 
            // from the form input
            $('#btn-add-group').click($.proxy(() => {
                let groupName = $('#txt-group-name').val();
                this.stagingArea.groups.push(groupName);

                this._renderModule(hb['wizard-group-content'], this.stagingArea, 'wizard-content')
                .then(() => console.log(this.stagingArea.groups));
            }, this));

            // Next button to Apps Creation
            $('btn-next').click($.proxy(this.loadAppsCreation, this));
        });
    }

    loadAppsCreation(){

    }


    /**
     * Load the default installation order for the wizard
     * @param {string} fileName extensionless json filename
     * @todo have it called only when needed and set promises properly. Currently called at constructor.  
     */
    loadOrderFile(fileName){
        let fileUri = fileName + ".json";
        $.getJSON(fileUri)
        .done(data => {
            this.stagingArea = data;
            this.stagingArea.fileName = fileUri;
        })
        .fail(xhr => console.log('error', xhr)); 
    }


    /**
     * @description First thing that must be called to set-up the App
     */
    start(){
        this._setupClientApp();
        this.loadLandingPage();
    }
}
WizardApp.instance = null;

export default WizardApp