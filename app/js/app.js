'use strict';

var app = angular.module('RedmineExtension', []);

app.directive('timer', function(){
  return {
    restrict: 'E',
    scope: {
      start: '=startTimer'
    },
    controller: function($scope, $interval){
      var timeout;
      $scope.hours = 0;
      $scope.minutes = 0;
      $scope.secounds =  0;
      $scope.milisecounds = 0;

      var convertTimer = function(time){
        $scope.hours = Math.trunc(time / 3600000);
        time = time % 3600000;
        $scope.minutes = Math.trunc(time / 60000);
        time = time % 60000;
        $scope.secounds = Math.trunc(time / 1000);
        $scope.milisecounds = time % 1000;
      };

      timeout = $interval(function(){
        convertTimer($scope.start);
      }, 1000);
    },
    template: '{{hours}}:{{minutes}}:{{secounds}}'
  }
});

app.factory('ChromeStorageAPI', [ '$q' ,function($q){
  return {
    local: true,

    useSync: function(){
      this.local = false;
    },

    useLocal: function(){
      this.local = true;
    },

    set: function(key, value, callback){
      if(this.local){
        localStorage.setItem(key, value);
      }else{
        var obj = {};
        obj[key] = value;

        chrome.storage.sync.set(obj, function(){
          if(callback)
            callback();
        });
      }
    },

    get: function(key) {
      if(this.local){
        return localStorage.getItem(key);
      }else{
        var deferred = $q.defer();
        chrome.storage.sync.get(key, function(data) {
          deferred.resolve(data[key]);
        });
        return deferred.promise;
      }
    },

    remove: function(key){
      this.set(key, '');
    }
  }
}]);

app.factory('RedmineAPI', ['$http', '$q', '$window', function($http, $q, $window){
  return {
    baseURL: '',
    token: '',
    authMode: 'P',

    setBaseURL : function(baseURL){
      this.baseURL = baseURL;
    },

    setApiKey : function(apiKey){
      this.authMode = 'K';
      this.token = apiKey;
    },

    setCookie : function(sessionCookie){
      this.authMode = 'C';
      this.token = "_redmine_session=" + sessionCookie;
    },

    setBasicAuth : function(token){
      this.authMode = 'B';
      this.token = "Basic " + token; 
    },

    request: function(url, method, postData, cb){      
      var deferred = $q.defer();

      var req = {
        method: (method ? method.toLocaleUpperCase() : 'GET'),
        url: this.baseURL + url,
        headers: {},
        data: postData
      };

      if(this.authMode == 'C'){
        req.headers = {
          "Cookie": this.token
        }
      }else if(this.authMode == 'B'){
        req.headers = {
          "Authorization": this.token
        }
      }else if(this.authMode == 'K'){
        if(req.url.indexOf('?') == -1){
          req.url += "?";
        }

        req.url += "&key=" + this.token;
      }

      $http(req)
      .success(function(r){
        if(cb){
          deferred.resolve(cb(r));
        }else
          deferred.resolve(r);
      })
      .error(function(er){
          deferred.reject(er); 
      });

      return deferred.promise;
    },

    getUser: function(){
      return this.request('/users/current.json','','', function(data){
        return data.user;
      });
    },

    getIssues: function(){
      return this.request('/issues.json?assigned_to_id=me','','', function(data){
        return data.issues;
      });
    },

    getIssue: function(id){
      return this.request('/issues/' + id + '.json','','', function(data){
        return data.issue;
      });
    },

    getIssueStatuses: function(){
      return this.request('/issue_statuses.json','','', function(data){
        return data.issue_statuses;
      });
    },

    getIssueTrackers: function(){
      return this.request('/trackers.json','','', function(data){
        return data.trackers;
      });
    },

    updateIssue: function(id, obj){
      return this.request('/issues/' + id + '.json','PUT', JSON.stringify({issue: obj}));
    },

    createTimeEntry: function(issueId, spentHours, activity, comments){
      var obj = {
        issue_id: issueId,
        hours: spentHours,
        activity_id: activity,
        comments: comments
      };

      return this.request('/time_entries.json','POST', JSON.stringify({time_entry: obj}));
    }
  }
}]);

app.controller('IssuesCtrl', ['$scope', 'RedmineAPI', function($scope, RedmineAPI){
  $scope.issues = [];
  $scope.issue = {};
  $scope.action = {};

  var getConvertedTimer = function(totalInMiliseconds){
    var h = Math.trunc(totalInMiliseconds / 3600000);
    var m = Math.ceil((totalInMiliseconds % 3600000) / 900000);

    if(m == 4){
      h++;
      m = 0;
    }
    return h + '.' + 25 * m;
  }

  $scope.getTimer = function(){
    return ((new Date().getTime()) - $scope.action.timer);
  }

  $scope.listIssues = function(cleanAction){
    $scope.issue = {};
    RedmineAPI.getIssues().then(function(r){
      $scope.issues = r;
    });

    $scope.$emit('changeView','listIssues');
    if(cleanAction)
      $scope.action = {};
      $scope.$emit('changeAction', {});
  };

  $scope.getIssue = function(id, startTimer){
    RedmineAPI.getIssue(id).then(function(r){
      $scope.issue = r;
    });

    $scope.$emit('changeView','issue');

    if(startTimer && !$scope.action.id){
      var action = {};

      action.id = id;
      action.timer = new Date().getTime();
      action.stopped = false;
      
      $scope.action = action;
    }
  };

  $scope.finalizeIssue = function(){
    $scope.action.stopped= true;
    $scope.action.total = getConvertedTimer($scope.getTimer());
    if($scope.trackers[0].default_status){
      $scope.action.tracker = $scope.trackers[0].default_status;
    }else {
      $scope.action.tracker = $scope.trackers[0];
    }
  };

  $scope.logTime = function(){
    var log = $scope.action;
    RedmineAPI.createTimeEntry(log.id, log.total, log.tracker.id, log.message).then(function(){
      $scope.listIssues(true);
    });
  };

  $scope.updateIssueStatus = function(issueId, statusId){
    $scope.error = issueId + " " + statusId;
    var issue = {
      status_id: statusId
    }
    
    RedmineAPI.updateIssue(issueId, issue);
  };

  $scope.getWorkflow = function(actualStatus){
    var status = [];

    for(var i in $scope.statuses){
      if(actualStatus == $scope.statuses[i].id){
        continue;
      }

      status.push($scope.statuses[i]);
    }

    return status;
  };

  $scope.$watch('action', function(newValue, old){
    if(!(newValue == old))
      $scope.$emit('changeAction', newValue);
  }, true);

  $scope.$on('issue', function(e, obj) {
    $scope.action = obj;
    $scope.getIssue(obj.id);
  });

  $scope.$on('listIssues', function(e) {
    $scope.listIssues();
  });
}]);

app.controller('MainCtrl', [ '$scope', 'RedmineAPI', 'ChromeStorageAPI', '$window', '$http',
               function($scope, RedmineAPI, ChromeStorageAPI, $window, $http){
  $scope.error = '';
  $scope.state = {
    view: '',
    obj: null
  };
  $scope.config = {};
  $scope.statuses = {};
  $scope.trackers = {};

  var updateState = function(obj){
    $scope.state.obj = obj;

    ChromeStorageAPI.set('state', $scope.state);
  };

  var checkAuth = function(){
    ChromeStorageAPI.get('config').then(function(d){
      if(d){
        $scope.config = d;
        RedmineAPI.setBaseURL(d.baseURL);
        
        if(d.useCookies){
          var url = d.baseURL.match(/^https?\:\/\/([^\/:?#]+)(?:[\/:?#]|$)/i)[1];
          chrome.cookies.getAll({domain: url, name: '_redmine_session'},function(r){
            RedmineAPI.setCookie(r[0]);
          });
        }else if(d.useAPIKey){
          RedmineAPI.setApiKey(d.apiKey);
        }else {
          RedmineAPI.setBasicAuth(btoa(d.username + ":" + d.password));
        }

        RedmineAPI.getIssueStatuses().then(function(st){
          $scope.statuses = st;
          RedmineAPI.getIssueTrackers().then(function(t){
            $scope.trackers = t;
          });
          ChromeStorageAPI.get('state').then(function(s){
            if(!s || !s.view){
              $scope.$broadcast('listIssues');
            }else {
              $scope.state = s;
              $scope.$broadcast(s.view, s.obj);
            }
          });
        }, function(e){
          $scope.error = 'Não foi possivel autenticar no Redmine';
        });
      }
    });
  };

  $scope.init = function(){
    ChromeStorageAPI.useSync();
    checkAuth();
  };

  $scope.logout = function(){
    ChromeStorageAPI.remove('config');
    ChromeStorageAPI.remove('state');

    var url = $scope.config.baseURL;
    $scope.config = {
      baseURL: url
    };
    $scope.state.view = '';
  };

  $scope.login = function(){
    $scope.error = '';
    ChromeStorageAPI.set('config', $scope.config);
    checkAuth();
  };

  $scope.$on('displayError', function(e, error) {
    $scope.error = error;
  });

  $scope.$on('changeView', function(e, view) {
    $scope.state.view = view;
  });

  $scope.$on('changeAction', function(e, obj) {
    updateState(obj);
  });

}]);