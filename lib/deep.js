var angular = {};

/*
 * Determine whether an Object is a plain object or not (created using "{}" or "new Object")
 * @param  {Object}  obj Object we want to check
 * @return {Boolean}     True/False result
 */
angular.isPlainObject = function (obj) {
  return !(typeof(obj) !== 'object' || obj && obj.nodeType || obj !== null && obj === obj.window || obj && obj.constructor && !Object.prototype.hasOwnProperty.call(obj.constructor.prototype, 'isPrototypeOf'));
};

/**
 * Removes duplicates from an Array
 * @param  {Array}  Array Array to dedup
 * @return {Array}        Array containing only unique values
 */
angular.unique = function (array) {
  var a = array.concat();

  for (var i = 0; i < a.length; ++i) {
    for (var j = i + 1; j < a.length; ++j) {
      if (a[i] === a[j]) {
        a.splice(j--, 1);
      }
    }
  }

  return a;
};

/**
 * Merge the contents of two or more objects into the target object
 * @param  {Boolean} deep      If true, the merge becomes recursive (optional)
 * @param  {Object}  target    The object receiving the new properties
 * @param  {Object}  arguments One or more additional objects to merge with the first
 * @return {Object}            The target object with the new contents
 *
 * angular.extend(object, object2)             // shallow copy
 * angular.extend(true, object, object2)       // deep copy
 * angular.extend(true, true, object, object2) // deep copy + dedup arrays
 */
angular.extend = function (target) {
  var i = 1,
    deep = false,
    dedup = false;

  if (typeof(target) === 'boolean') {
    deep = target;
    target = arguments[1] || {};
    i++;

    if (typeof(target) === 'boolean') {
      dedup = target;
      target = arguments[2] || {};
      i++;
    }
  }

  [].slice.call(arguments, i).forEach(function (obj) {
    var src, copy, isArray, clone;

    if (obj === target) {
      return;
    }

    if (deep && obj instanceof Array) {
      target = dedup ? angular.unique(target.concat(obj)) : target.concat(obj);
    }
    else {
      for (var key in obj) {
        src = target[key];
        copy = obj[key];

        if (target === copy || src === copy) {
          continue;
        }

        if ((isArray = copy instanceof Array) || deep && copy && (angular.isPlainObject(copy))) {
          if (isArray) {
            clone = (src && src instanceof Array) ? src : [];
          }
          else {
            clone = (src && angular.isPlainObject(src)) ? src : {};
          }

          isArray = false;

          if (dedup) {
            target[key] = angular.extend(deep, dedup, clone, copy);
          }
          else {
            target[key] = angular.extend(deep, clone, copy);
          }
        }
        else if (copy !== undefined) {
          target[key] = copy;
        }
      }
    }
  });

  return target;
};

module.exports = angular;