#!/usr/bin/env node
const path = require('path');
const crypto = require('crypto');
const inquirer = require('inquirer');
const Enum = require('enum');
const safeApp = require('safe-app');
const fse = require('fs-extra');
const clc = require('cli-color');
const pkg = require('./package.json');

const error = clc.red.bold;
const warn = clc.yellow;
const notice = clc.greenBright;

const APP_INFO = {
  data: {
    id: pkg.identifier,
    scope: null,
    name: pkg.name,
    vendor: pkg.author.name
  },
  opt: {
    own_container: false
  },
  permissions: {
    _public: [
      'Read',
      'Insert',
      'Update',
      'Delete',
      'ManagePermissions'
    ]
  }
};
const configKeys = new Enum([
  'authRes'
]);
const baseOptions = new Enum([
  'Send auth request',
  'Connect with SAFE Network',
  'Create Mutable Data',
  'Get MData entries',
  'Delete Mdata key',
  'Exit'
]);
const configFile = path.resolve(__dirname, 'config.json');
const typetag = 16543;
const publicId = crypto.randomBytes(32).toString('hex');
const SAMPLE_KEYS = {'key1': 'val1', 'key2': 'val2'};
let safe = null;
let dataEntries = {};

/**
 * general operations
 */

const exit = () => {
  process.exit();
};

const ensureConfig = () => {
  fse.ensureFileSync(configFile);
};

const getConfig = () => {
  return fse.readJsonSync(configFile, { throws: false });
};

const setConfig = (key, val) => {
  let config = getConfig();
  if (!config) {
    config = {};
  }
  config[key] = val;
  fse.outputJsonSync(configFile, config);
};

/**
 * API Calls
 */

const authorise = () => {
  return safeApp.initializeApp(APP_INFO.data)
    .then((app) => app.auth.genAuthUri(APP_INFO.permissions, APP_INFO.opt)
      .then((res) => {
        app.auth.openUri(res.uri);
      }));
};

const connect = () => {
  setTimeout(function () {}, 5000);
  const resUri = getConfig()[configKeys.get('authRes').key];
  return safeApp.fromAuthURI(APP_INFO.data, resUri)
    .then((app) => (safe = app))
    .then(() => console.log(notice('Connected with SAFE Network!!!')))
    .catch(err => error(`Error :: Unable to connect with SAFE Network`));
};

const createMD = () => {
  let publicName = null;
  setTimeout(function () {}, 5000);
  return safe.mutableData.newRandomPublic(typetag)
    .then((m) => m.quickSetup(SAMPLE_KEYS).then(() => m.getNameAndTag()))
    .then((data) => (publicName = data.name))
    .then(() => safe.auth.getAccessContainerInfo('_public'))
    .then((mdata) => mdata.getEntries()
      .then((entries) => entries.mutate()
        .then((mut) => mut.insert(publicId, publicName)
          .then(() => mdata.applyEntriesMutation(mut)))))
    .then(() => console.log(notice(`Created MD :: ${JSON.stringify(SAMPLE_KEYS)}`)))
    .catch(err => console.error(error(`Error :: Create MD - ${err.message}`)));
};

const getMDEntries = () => {
  setTimeout(function () {}, 5000);
  dataEntries = {};
  return safe.auth.getAccessContainerInfo('_public')
    .then((mdata) => mdata.getEntries())
    .then((entries) => entries.get(publicId))
    .then((value) => safe.mutableData.newPublic(value.buf, typetag))
    .then((mut) => mut.getEntries()
      .then((entries) => entries.forEach((key, val, version) => {
        const valStr = val.buf.toString();
        if (valStr)
          dataEntries[key.toString()] = valStr;
      })))
    .then(() => console.log(notice(`Fetched MD Entries :: ${JSON.stringify(dataEntries)}`)))
    .catch(err => console.error(error(`Error :: Fetch MD - ${err.message}`)));
};

const deleteMDEntry = () => {
  setTimeout(function () {}, 5000);
  const key = Object.keys(dataEntries)[0];
  if (!key) {
    return Promise.resolve(console.error(error('No entries found')));
  }
  return safe.auth.getAccessContainerInfo('_public')
    .then((mdata) => mdata.getEntries())
    .then((entries) => entries.get(publicId))
    .then((value) => safe.mutableData.newPublic(value.buf, typetag))
    .then((mdata) => mdata.getEntries()
      .then((entries) => entries.get(key)
        .then((value) => entries.mutate()
          .then((mut) => mut.remove(key, value.version + 1)
            .then(() => mdata.applyEntriesMutation(mut))))))
    .then(() => console.log(notice('Deleted key')))
    .catch(err => console.error(error(`Error :: Delete MD key - ${err.message}`)));
};

/**
 * CLI interface
 */

const getAuthResponse = () => {
  inquirer.prompt([{
    type: "input",
    name: "authRes",
    message: "Enter auth response :: "
  }]).then((ans) => {
    setConfig(configKeys.get('authRes').key, ans.authRes);
    showBaseOptions();
  });
};

const baseAction = (ans) => {
  const next = (fn, nxtFn) => {
    return fn().then(() => nxtFn());
  };

  switch (ans.cmdOpt) {
    case baseOptions.get('Send auth request').key:
      return next(authorise, getAuthResponse);
      break;
    case baseOptions.get('Connect with SAFE Network').key:
      return next(connect, showBaseOptions);
      break;
    case baseOptions.get('Create Mutable Data').key:
      return next(createMD, showBaseOptions);
      break;
    case baseOptions.get('Get MData entries').key:
      return next(getMDEntries, showBaseOptions);
      break;
    case baseOptions.get('Delete Mdata key').key:
      return next(deleteMDEntry, showBaseOptions);
      break;
    case baseOptions.get('Exit').key:
      return exit();
      break;
    default:
      console.log(warn('Invalid Choice'));
      showBaseOptions();
      break;
  }
};

const showBaseOptions = () => {
  inquirer.prompt([{
    type: "list",
    name: "cmdOpt",
    message: "Select your choice :: ",
    choices: baseOptions.enums.map(i => i.key)
  }]).then(baseAction);
};

ensureConfig();
showBaseOptions();