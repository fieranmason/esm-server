'use strict';
// =========================================================================
//
// Controller for projects
//
// =========================================================================
var path                = require ('path');
var DBModel             = require (path.resolve('./modules/core/server/controllers/core.dbmodel.controller'));
var UserClass           = require (path.resolve('./modules/users/server/controllers/admin.server.controller'));
var PhaseClass          = require (path.resolve('./modules/phases/server/controllers/phase.controller'));
var PhaseBaseClass      = require (path.resolve('./modules/phases/server/controllers/phasebase.controller'));
var OrganizationClass   = require (path.resolve('./modules/organizations/server/controllers/organization.controller'));
var StreamClass         = require (path.resolve('./modules/streams/server/controllers/stream.controller'));
var RecentActivityClass = require (path.resolve('./modules/recent-activity/server/controllers/recent-activity.controller'));
var _                   = require ('lodash');
var Role        				= require ('mongoose').model ('_Role');
var util = require('util');

module.exports = DBModel.extend ({
	name : 'Project',
	plural : 'projects',
	sort: {name:1},
	populate: 'currentPhase phases phases.milestones phases.milestones.activities proponent primaryContact',
	// bind: ['addPrimaryUser','addProponent'],
	init: function () {
		this.recent = new RecentActivityClass (this.opts);
	},
	postMessage: function (obj) {
		this.recent.create (_.extend ({
			headline: 'news headline',
			content: 'news content',
			project: 'project_id',
			type: 'News'
		}, obj));
	},
	// -------------------------------------------------------------------------
	//
	// Before adding a project this is what must happen:
	//
	// set up the eao and proponent admin and member roles
	// add them to the project
	// reverse add the project to the roles
	// add the project admin role to the current user, eao if internal, proponent
	//    otherwise
	// reset the user roles in this object so the user can save it
	//
	// -------------------------------------------------------------------------
	preprocessAdd : function (project) {
		var self = this;
		var rolePrefix;
		var adminSuffix = ':admin';
		var projectAdminRole;
		var projectProponentAdmin;
		var projectProponentMember;
		var sectorRole;
		//
		// return a promise, we have lots of work to do
		//
		return new Promise (function (resolve, reject) {
			//
			// first generate a project code that can be used internally
			//
			project.code = project.shortName.toLowerCase ();
			project.code = project.code.replace (/\W/g,'-');
			project.code = project.code.replace (/-+/,'-');
			//
			// this does the work of that and returns a promise
			//
			self.guaranteeUniqueCode (project.code)
			//
			// then go about setting up the default admin roles on both
			// sides of the fence
			//
			.then (function (projectCode) {
				//
				// if the project hasn't an orgCode yet then copy in the user's
				//
				if (!project.orgCode) project.orgCode = self.user.orgCode;

				return self.initDefaultRoles(project);
			})
			//
			// add the appropriate role to the user
			//
			.then (function (objectRoles) {
				//console.log ('Step3. assign admin role to user');
				// console.log ('project is now ', project);
				var userRole = (self.user.orgCode !== 'eao' && self.user.orgCode === project.orgCode) ? project.proponentAdminRole : project.adminRole;
				//
				// TBD ROLES
				//
				return Promise.resolve ();
				// return Roles.userRoles ({
				// 	method: 'add',
				// 	users: self.user,
				// 	roles: userRole
				// });
			})
			//
			// update this model's user roles
			// do this because the user now has new access, without this they
			// cannot save the project
			//
			.then (function () {
				// console.log ('Step4. set query access roles in the dbmodel object');
				project.setRoles (self.user);
				return project;
			})
			//
			// add a pre submission phase (intake)
			//
			.then (function (proj) {
				//console.log ('Step5. add the default phases, pre-stream');
				if (!project.phases || project.phases.length === 0) {
					// Add default phases to project.
					return ['intake', 'pre-ea', 'pre-app', 'evaluation', 'application-review', 'decision', 'post-certification'].reduce(function (promise, phase, index) {
						return promise.then(function () {
							return self.addPhase(project, phase);
						});
					}, Promise.resolve())
					// Assign current phase, and start.
					.then(function (m) {
						var Phase = new PhaseClass(self.opts);
						if (m.phases[0].name) {
							// console.log ('new phase = ', m.phases[0].code, m.phases[0].name, m.phases[0]._id);
							m.currentPhase = m.phases[0];
							m.currentPhaseCode = m.phases[0].code;
							m.currentPhaseName = m.phases[0].name;
							Phase.start(m.currentPhase);
							return m;
						} else {
							return Phase.findById(m.phases[0])
								.then(function (p) {
									m.currentPhase = p._id;
									m.currentPhaseCode = p.code;
									m.currentPhaseName = p.name;
									Phase.start(p);
									return m;
								});
						}
					});
				} else {
					return Promise.resolve();
				}
			})
			.then (resolve, reject);
		});
	},
	// -------------------------------------------------------------------------
	//
	// build a permission set from the default eao and proponent roles for the
	// project indicated by the projectCode copied earlier from the milestone
	// return the promise from the role machine (this also saves the activity
	// and resolves to the list of activities passed in, all saved)
	//
	// -------------------------------------------------------------------------
	setDefaultRoles: function (project, base) {
		//
		// TBD ROLES
		//
		project.setRoles ({
			read   : ['eao-admin', 'pro-admin', 'eao-member', 'pro-member'],
			write  : ['eao-admin', 'pro-admin'],
			delete : ['eao-admin', 'pro-admin'],
		});
		return project;

	},
	// -------------------------------------------------------------------------
	//
	// Add a phase to the project from a code
	//
	// -------------------------------------------------------------------------
	addPhase: function (project, basecode) {
		var self = this;
		var Phase = new PhaseClass (self.opts);
		return new Promise (function (resolve, reject) {
			//
			// get the new phase
			//
			Phase.fromBase (basecode, project)
			.then (function (phase) {
				// console.log ('new phase', phase.name, phase._id);
				project.phases.push (phase);
				return project;
			})
			.then (self.saveDocument)
			.then (function (pro) {
				// console.log ('pro.phases:', JSON.stringify (pro.phases, null, 4));
				return pro;
			})
			.then (resolve, reject);
		});
	},
	// -------------------------------------------------------------------------
	//
	// set a project to submitted
	//
	// -------------------------------------------------------------------------
	submit: function (project) {
		var self = this;
		return new Promise (function (resolve, reject) {
			//
			// set the status to submitted
			//
			project.status = 'Submitted';
			//
			// select the right sector lead role
			//
			project.sectorRole = project.type.toLowerCase ();
			project.sectorRole = project.sectorRole.replace (/\W/g,'-');
			project.sectorRole = project.sectorRole.replace (/-+/,'-');
			self.saveDocument (project).then (function (p) {
				//
				// add the project to the roles and the roles to the project
				// this is where the project first becomes visible to EAO
				// through the project admin role and the sector lead role
				// (we dont wait on the promise here, just trust it)
				//
				//
				// TBD ROLES
				//
				return p;
				// return Roles.objectRoles ({
				// 	method      : 'add',
				// 	objects     : p,
				// 	type        : 'projects',
				// 	permissions : {submit : [p.adminRole, p.sectorRole]}
				// });
			})
			.then (resolve, reject);
		});
	},
	// -------------------------------------------------------------------------
	//
	// complete the current phase (does not start the next, just completes the
	// current but leaves it as the current phase)
	//
	// -------------------------------------------------------------------------
	completeCurrentPhase: function (project) {
		var self = this;
		return new Promise (function (resolve, reject) {
			if (!project.currentPhase) resolve (project);
			else {
				var Phase = new PhaseClass (self.opts);
				Phase.findById(project.currentPhase)
				.then(function (phase) {
					return Phase.complete (phase);
				})
				.then (function () {
					// This is where we should re-get the project and resolve/return it back
					resolve (self.findOne({_id: project._id}));
				})
				.catch (reject);
			}
		});
	},
	// -------------------------------------------------------------------------
	//
	// start the next phase (if the current phase is not completed then complete
	// it first)
	//
	// -------------------------------------------------------------------------
	startNextPhase : function (project) {
		var self = this;
		return new Promise (function (resolve, reject) {
			if (!project.currentPhase) resolve (project);
			else {
				var Phase = new PhaseClass (self.opts);
				//
				// this is a no-op if the phase is already completed so its ok
				//
				Phase.complete (project.currentPhase)
				.then (function () {
					var nextIndex = _.findIndex(project.phases, function(phase) { return phase._id.toString() === project.currentPhase._id.toString(); }) + 1;

					project.currentPhase     = project.phases[nextIndex];
					project.currentPhaseCode = project.phases[nextIndex].code;
					project.currentPhaseName = project.phases[nextIndex].name;
					return Phase.start (project.currentPhase);
				})
				.then (function () {
					return self.saveAndReturn (project)
						.then(function(res) {
							resolve(res);
						});
				})
				.catch (reject);
			}
		});
	},
	// -------------------------------------------------------------------------
	//
	// publish, unpublish
	//
	// -------------------------------------------------------------------------
	publish: function (project, value) {
		var self = this;
		if (value) {
			//
			// add a news item
			//
			self.postMessage ({
				headline: 'New Assessment: '+project.name,
				content: 'New Environmental Assessment: '+project.name+'\n'+project.description,
				project: project._id,
				type: 'News'
			});
			project.publish ();
		}
		else project.unpublish ();
		return this.saveAndReturn (project);
	},
	// -------------------------------------------------------------------------
	//
	// only published projects, minimal get
	//
	// -------------------------------------------------------------------------
	published: function () {
		return this.model.find ({
			isPublished: true
		},{
			_id: 1, code: 1, name: 1, region: 1, status: 1, eacDecision: 1, currentPhase: 1, lat: 1, lon: 1, type: 1, description: 1, memPermitID: 1
		})
		.sort ({
			name: 1
		})
		.populate (
			'currentPhase', 'name'
		)
		.exec ();
	},
	// -------------------------------------------------------------------------
	//
	// just what I can write to
	//
	// -------------------------------------------------------------------------
	mine: function () {
		var self = this;

		var findMyRoles = function (username) {
			return new Promise(function (fulfill, reject) {
				Role.find({
					user: username
				}).exec(function (error, data) {
					if (error) {
						reject(new Error(error));
					} else if (!data) {
						reject(new Error('findMyRoles: Roles not found for username: ' + username));
					} else {
						fulfill(data);
					}
				});
			});
		};

		var getMyProjects = function(roles) {
			var projectCodes = _.uniq(_.map (roles, 'context'));
			var q = {
				code: { "$in": projectCodes },
				dateCompleted: { "$eq": null }
			};
			return self.listforaccess ('i do not want to limit my access', q, { _id: 1, code: 1, name: 1, region: 1, status: 1, currentPhase: 1, lat: 1, lon: 1, type: 1, description: 1 }, 'currentPhase', 'name');
		};

		return findMyRoles(self.user.username)
			.then(function(roles) {
				//console.log("roles = " + JSON.stringify(roles, null, 4));
				return getMyProjects(roles);
			})
			.then(function(projects) {
				//console.log("projects = " + JSON.stringify(projects, null, 4));
				return projects;
			});
	},

	initDefaultRoles : function(project) {
		console.log('initDefaultRoles(' + project.code + ')');
		var defaultRoles = [];

		project.adminRole = project.code + ':eao:admin';
		project.proponentAdminRole = project.code + ':pro:admin';
		project.eaoInviteeRole = project.code + ':eao:invitee';
		project.proponentInviteeRole = project.code + ':pro:invitee';
		project.eaoMember = project.code + ':eao:member';
		project.proMember = project.code + ':pro:member';

		defaultRoles.push(project.eaoMember);
		defaultRoles.push(project.proMember);

		//
		// TBD ROLES
		//
		return Promise.resolve (defaultRoles);
	}

});
