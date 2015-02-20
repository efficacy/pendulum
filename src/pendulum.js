/*jslint node: true */
"use strict";

var util = require('util');
var async = require('async');
var path = require('path');
var fs = require('fs');
var osenv = require('osenv');
var exec = require('child_process').exec;

module.exports = function instance(workspace, home, project) {
  return {
    home: home || osenv.home(),
    project: project || process.env.PENDULUM_PROJECT,
    workspace: workspace || process.cwd(),

    repos: [],
    modules: [],
    location: {},
    depends: {},
    builds: {},
    stamp: 0,

    reindex: function reindex(callback) {
      var self = this;
      self.repos = [];
      fs.readFile(path.join(self.home, '.grconfig.json'), { 'encoding': 'utf8'}, function(err, content) {
        if (err && callback) return callback(err);
        var parsed = JSON.parse(content);
        var projects = parsed.tags;
        async.each(Object.keys(projects), function(k, done) {
          if (self.project && k != self.project) return done();
          
          projects[k].forEach(function(project) {
            var module = path.basename(project);
            self.repos.push(project);
            self.modules.push(module);
            self.location[module] = project;
          });
          console.log('repos: ' + util.inspect(self.repos));
          done();
        }, function(err) {
          if (err) return callback(err);

          function depend(module, dep) {
            if (self.modules.indexOf(dep) != -1) {
              if (!self.depends[module]) self.depends[module] = [];
              self.depends[module].push(dep);
              if (!self.builds[dep]) self.builds[dep] = [];
              self.builds[dep].push(module);
            }
          }

          async.each(self.modules, function(module, done) {
            fs.readFile(path.join(self.location[module], 'package.json'), { 'encoding': 'utf8'}, function(err, content) {
              if (err && callback) return done(err);

              var parsed = JSON.parse(content);
              if (parsed.dependencies) Object.keys(parsed.dependencies).forEach(function(dep) {
                depend(module, dep);
              });
              if (parsed.devDependencies) Object.keys(parsed.devDependencies).forEach(function(dep) {
                depend(module, dep);
              });
              done();
            });
          },function(err) {
            console.log('deps: ' + util.inspect(self.depends));
            console.log('builds: ' + util.inspect(self.builds));
            if (callback) callback(err);
          });
        });
      });
    },

    link: function link(callback) {
      var self = this;
      async.each(self.modules, function(module, done) {
        process.chdir(path.dirname(self.location[module]));
        var child = exec('npm link', function(err) {
          if (err) return done(err);
          async.each(self.depends[module], function(dep, done) {
            fs.unlink(path.join(self.location[module], 'node_modules', dep), function(err) {
              if (err) return done(err);
              exec('npm link ' + module, function(err) {
                done(err);
              }).stderr.pipe(process.stderr);
            });
          }, function(err) {
            done(err);
          });
        }).stderr.pipe(process.stderr);
      }, function(err) {
        if (callback) callback(err);
      });
    },

    unlink: function link(callback) {
      var self = this;
      async.each(self.modules, function(module, done) {
        async.each(self.depends[module], function(dep, done) {
          fs.unlink(path.join(self.location[module], 'node_modules', dep), done);
        }, function(err) {
          if (err) return done(err);
          process.chdir(path.dirname(self.location[module]));
          var child = exec('npm install', done).stderr.pipe(process.stderr);
        });
      }, function(err) {
        if (callback) callback(err);
      });
    },

    test: function test() {
      var self = this;
    }
  };
};
