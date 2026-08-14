const PROPS = PropertiesService.getScriptProperties();
const STATE_KEY = 'SUM_OSCARS_STATE';
const NOMINATIONS_KEY = 'SUM_OSCARS_NOMINATIONS';
const ADMIN_PASSWORD_KEY = 'ADMIN_PASSWORD';
const CATEGORIES = ['Most Valuable Member','Most Loyal Member','Most Funniest Member','Best Staff Member','Biggest Crashout','Best Duo','Best Profile','Best Friendgroup','Best Hater','Best Ragebaiter','Most Annoying','Best Looking Male','Best Looking Female'];

function defaultState_() {
  const categories = {};
  CATEGORIES.forEach(function(name) { categories[name] = {open:false}; });
  return {categories:categories, round2:false, round2Data:[]};
}

function getState_() {
  const raw = PROPS.getProperty(STATE_KEY);
  if (!raw) { const state = defaultState_(); saveState_(state); return state; }
  try {
    const state = JSON.parse(raw);
    state.categories = state.categories || {};
    CATEGORIES.forEach(function(name) { if (!state.categories[name]) state.categories[name] = {open:false}; });
    state.round2 = !!state.round2;
    state.round2Data = Array.isArray(state.round2Data) ? state.round2Data : [];
    return state;
  } catch (err) { const state = defaultState_(); saveState_(state); return state; }
}

function saveState_(state) { PROPS.setProperty(STATE_KEY, JSON.stringify(state)); }
function output_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function outputJsonp_(value, callback) { var cb = String(callback || 'callback').replace(/[^a-zA-Z0-9_.$]/g,''); return ContentService.createTextOutput(cb+'('+JSON.stringify(value)+')').setMimeType(ContentService.MimeType.JAVASCRIPT); }

function doGet(e) {
  const state = getState_();
  const result = {ok:true,categories:state.categories,round2:state.round2,round2Data:state.round2Data};
  return e && e.parameter && e.parameter.callback ? outputJsonp_(result,e.parameter.callback) : output_(result);
}

function requireAdmin_(password) {
  const expected = PROPS.getProperty(ADMIN_PASSWORD_KEY);
  if (!expected) throw new Error('ADMIN_PASSWORD is not configured in Script Properties.');
  if (!password || String(password) !== expected) throw new Error('Invalid moderator password.');
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || '');
    if (action === 'submit') return submit_(p);
    requireAdmin_(p.password);
    const state = getState_();
    if (action === 'setCategory') {
      const category = String(p.category || '');
      if (CATEGORIES.indexOf(category) < 0) throw new Error('Unknown category.');
      state.categories[category].open = String(p.open) === 'true';
    } else if (action === 'setRound2') {
      state.round2 = String(p.open) === 'true';
    } else if (action === 'setFinalists') {
      const data = JSON.parse(String(p.data || '[]'));
      if (!Array.isArray(data)) throw new Error('Finalists must be an array.');
      state.round2Data = data;
    } else if (action === 'clearNominations') {
      PROPS.deleteProperty(NOMINATIONS_KEY);
      return output_({ok:true});
    } else if (action === 'getNominations') {
      return output_({ok:true,nominations:getNominations_()});
    } else { throw new Error('Unknown action.'); }
    saveState_(state);
    return output_({ok:true});
  } catch (err) { return output_({ok:false,error:String(err.message || err)}); }
}

function submit_(p) {
  const submitter = String(p.submitter || '').trim();
  if (!submitter) throw new Error('Discord username is required.');
  const data = JSON.parse(String(p.data || '{}'));
  const state = getState_();
  const missing = [];
  const closed = [];
  CATEGORIES.forEach(function(category) {
    const value = data[category];
    const hasValue = Array.isArray(value) ? value.some(function(v){return String(v || '').trim();}) : String(value || '').trim();
    if (state.categories[category].open) {
      if (category !== 'Best Friendgroup' && !hasValue) missing.push(category);
    } else if (hasValue) closed.push(category);
  });
  if (closed.length) throw new Error('These categories are closed: '+closed.join(', '));
  if (missing.length) throw new Error('Please nominate someone for: '+missing.join(', '));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const nominations = getNominations_();
    nominations.push({id:Utilities.getUuid(),submitter:submitter,data:data,time:new Date().toISOString()});
    PROPS.setProperty(NOMINATIONS_KEY,JSON.stringify(nominations));
  } finally { lock.releaseLock(); }
  return output_({ok:true});
}

function getNominations_() {
  const raw = PROPS.getProperty(NOMINATIONS_KEY);
  if (!raw) return [];
  try { const data = JSON.parse(raw); return Array.isArray(data) ? data : []; } catch (err) { return []; }
}

function initialize() { if (!PROPS.getProperty(STATE_KEY)) saveState_(defaultState_()); }
