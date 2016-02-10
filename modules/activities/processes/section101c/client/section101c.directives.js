'use strict';

angular.module('process')
    .run( initProcessSection101c )
    .directive('tmplProcessSection101C',  directiveProcessSection101c);
// -----------------------------------------------------------------------------------
//
// Config: register this task with the UI
//
// -----------------------------------------------------------------------------------
initProcessSection101c.$inject = ['ProcessCodes'];
/* @ngInject */
function initProcessSection101c(ProcessCodes) {
    ProcessCodes.push('Section 101c');
}
// -----------------------------------------------------------------------------------
//
// DIRECTIVE
//
// -----------------------------------------------------------------------------------
directiveProcessSection101c.$inject = [];
/* @ngInject */
function directiveProcessSection101c() {
    var directive = {
        restrict: 'E',
        templateUrl: 'modules/activities/processes/section101c/client/section101c.html',
        controller: 'controllerProcessSection101c',
        controllerAs: 'processSection101c',
        scope: {
            project: '='
        }
    };
    return directive;
}
