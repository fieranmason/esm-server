
'use strict';
// =========================================================================
//
// this is the data model (service). This is how all data
// is accessed through the front end
//
// =========================================================================
angular.module('emailtemplate').factory ('EmailTemplateModel', function (ModelBase) {
  //
  // build the model by extending the base model. the base model will
  // have all the basic crud stuff built in
  //
  var Class = ModelBase.extend ({
    urlName : 'emailtemplate'
  });
  return new Class ();
});


