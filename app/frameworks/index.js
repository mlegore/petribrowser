import { lstatSync, readdirSync } from 'fs'
import { toStream } from 'emit-stream'
import through from 'through'
import { path, join } from 'path'
import hello from './hello/index.js'
import ssb from './ssb/index.js'
import { Writable } from 'stream';
import rpc from 'pauls-electron-rpc'
import {getFrameworkPerm} from '../lib/strings'
import {queryPermission as queryPerm} from '../background-process/ui/permissions'
import {internalOnlyOrAuthorPage} from '../lib/bg/rpc'
import {getPermission} from '../background-process/web-apis/framework'

function emitterAPIToStream(method) {
  return (...args) => {
    var cb = function(type, data) {
      s.writable && s.write([type, {data}]);
    }

    args.push(cb)
    var emitter = method.apply(this, args)

    var s = through(
        function write (a) {
            this.emit('data', a);
        },
        function end () {
            // If we need to remove listeners upstream, do so
            cb.close && cb.close()
        }
    )

    return s
  }
}

function framework (frameworkName) {
  var checkPermissions = function (event, methodName, args) {
    return (event && event.sender && getPermission(event.sender.getURL(), frameworkName))
  }

  return {
    exportInternalAPI (manifest, api) {
      // Extend api to support EventEmitters and Listeners
      api = Object.keys(api).reduce(function (acc, key) {
        acc[key] = manifest[key] === 'emitter' ? emitterAPIToStream(api[key]) : api[key]
        return acc
      }, {})

      manifest = Object.keys(manifest).reduce(function (acc, key) {
        acc[key] = manifest[key] === 'emitter' ? 'readable' : manifest[key]
        return acc
      }, {})

      rpc.exportAPI('internal-' + frameworkName, manifest, api, internalOnlyOrAuthorPage)
    },
    exportAPI (manifest, api) {
      // Extend api to support EventEmitters and Listeners
      api = Object.keys(api).reduce(function (acc, key) {
        acc[key] = manifest[key] === 'emitter' ? emitterAPIToStream(api[key]) : api[key]
        return acc
      }, {})

      manifest = Object.keys(manifest).reduce(function (acc, key) {
        acc[key] = manifest[key] === 'emitter' ? 'readable' : manifest[key]
        return acc
      }, {})

      rpc.exportAPI('framework/' + frameworkName, manifest, api, checkPermissions)
    },
    async queryPermission (frameworkPerm, sender) {
      var perm = getFrameworkPerm(frameworkName, frameworkPerm)
      return await queryPerm(perm, sender)
    }
  }
}

var frameworks = { hello: hello(framework('hello')), ssb: ssb(framework('ssb')) }

export default {
  frameworks,
  setup () {
    for(var framework in frameworks) {
      if(frameworks.hasOwnProperty(framework)) {
        frameworks[framework].setup()
      }
    }
  }
}
