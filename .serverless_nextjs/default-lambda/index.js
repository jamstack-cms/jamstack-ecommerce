'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var PrerenderManifest = require('./prerender-manifest.json');
var Manifest = require('./manifest.json');
var RoutesManifestJson = require('./routes-manifest.json');
var Stream = require('stream');
var zlib = require('zlib');
var http = require('http');
var perf_hooks = require('perf_hooks');
var buffer$1 = require('buffer');
var util$1 = require('util');
var crypto = require('crypto');
var url = require('url');
var fs = require('fs');
var os = require('os');
var path = require('path');
var child_process = require('child_process');
var https = require('https');
require('http2');
var process$1 = require('process');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var PrerenderManifest__default = /*#__PURE__*/_interopDefaultLegacy(PrerenderManifest);
var Manifest__default = /*#__PURE__*/_interopDefaultLegacy(Manifest);
var RoutesManifestJson__default = /*#__PURE__*/_interopDefaultLegacy(RoutesManifestJson);
var Stream__default = /*#__PURE__*/_interopDefaultLegacy(Stream);
var zlib__default = /*#__PURE__*/_interopDefaultLegacy(zlib);
var http__default = /*#__PURE__*/_interopDefaultLegacy(http);
var buffer__default = /*#__PURE__*/_interopDefaultLegacy(buffer$1);
var util__default = /*#__PURE__*/_interopDefaultLegacy(util$1);
var crypto__default = /*#__PURE__*/_interopDefaultLegacy(crypto);
var process__default = /*#__PURE__*/_interopDefaultLegacy(process$1);

const specialNodeHeaders = [
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
];

const readOnlyCloudFrontHeaders = {
  "accept-encoding": true,
  "content-length": true,
  "if-modified-since": true,
  "if-none-match": true,
  "if-range": true,
  "if-unmodified-since": true,
  "transfer-encoding": true,
  via: true
};

const HttpStatusCodes = {
  202: "Accepted",
  502: "Bad Gateway",
  400: "Bad Request",
  409: "Conflict",
  100: "Continue",
  201: "Created",
  417: "Expectation Failed",
  424: "Failed Dependency",
  403: "Forbidden",
  504: "Gateway Timeout",
  410: "Gone",
  505: "HTTP Version Not Supported",
  418: "I'm a teapot",
  419: "Insufficient Space on Resource",
  507: "Insufficient Storage",
  500: "Server Error",
  411: "Length Required",
  423: "Locked",
  420: "Method Failure",
  405: "Method Not Allowed",
  301: "Moved Permanently",
  302: "Moved Temporarily",
  207: "Multi-Status",
  300: "Multiple Choices",
  511: "Network Authentication Required",
  204: "No Content",
  203: "Non Authoritative Information",
  406: "Not Acceptable",
  404: "Not Found",
  501: "Not Implemented",
  304: "Not Modified",
  200: "OK",
  206: "Partial Content",
  402: "Payment Required",
  308: "Permanent Redirect",
  412: "Precondition Failed",
  428: "Precondition Required",
  102: "Processing",
  407: "Proxy Authentication Required",
  431: "Request Header Fields Too Large",
  408: "Request Timeout",
  413: "Request Entity Too Large",
  414: "Request-URI Too Long",
  416: "Requested Range Not Satisfiable",
  205: "Reset Content",
  303: "See Other",
  503: "Service Unavailable",
  101: "Switching Protocols",
  307: "Temporary Redirect",
  429: "Too Many Requests",
  401: "Unauthorized",
  422: "Unprocessable Entity",
  415: "Unsupported Media Type",
  305: "Use Proxy"
};

const toCloudFrontHeaders = (headers, originalHeaders) => {
  const result = {};
  const lowerCaseOriginalHeaders = {};
  Object.entries(originalHeaders).forEach(([header, value]) => {
    lowerCaseOriginalHeaders[header.toLowerCase()] = value;
  });

  Object.keys(headers).forEach((headerName) => {
    const lowerCaseHeaderName = headerName.toLowerCase();
    const headerValue = headers[headerName];

    if (readOnlyCloudFrontHeaders[lowerCaseHeaderName]) {
      if (lowerCaseOriginalHeaders[lowerCaseHeaderName]) {
        result[lowerCaseHeaderName] =
          lowerCaseOriginalHeaders[lowerCaseHeaderName];
      }
      return;
    }

    result[lowerCaseHeaderName] = [];

    if (headerValue instanceof Array) {
      headerValue.forEach((val) => {
        result[lowerCaseHeaderName].push({
          key: headerName,
          value: val.toString()
        });
      });
    } else {
      result[lowerCaseHeaderName].push({
        key: headerName,
        value: headerValue.toString()
      });
    }
  });

  return result;
};

const isGzipSupported = (headers) => {
  let gz = false;
  const ae = headers["accept-encoding"];
  if (ae) {
    for (let i = 0; i < ae.length; i++) {
      const { value } = ae[i];
      const bits = value.split(",").map((x) => x.split(";")[0].trim());
      if (bits.indexOf("gzip") !== -1) {
        gz = true;
      }
    }
  }
  return gz;
};

const defaultOptions = {
  enableHTTPCompression: false
};

const handler = (event, { enableHTTPCompression } = defaultOptions) => {
  const { request: cfRequest, response: cfResponse = { headers: {} } } = event;

  const response = {
    headers: {}
  };

  const newStream = new Stream__default['default'].Readable();

  const req = Object.assign(newStream, http__default['default'].IncomingMessage.prototype);
  req.url = cfRequest.uri;
  req.method = cfRequest.method;
  req.rawHeaders = [];
  req.headers = {};
  req.connection = {};

  if (cfRequest.querystring) {
    req.url = req.url + `?` + cfRequest.querystring;
  }

  const headers = cfRequest.headers || {};

  for (const lowercaseKey of Object.keys(headers)) {
    const headerKeyValPairs = headers[lowercaseKey];

    headerKeyValPairs.forEach((keyVal) => {
      req.rawHeaders.push(keyVal.key);
      req.rawHeaders.push(keyVal.value);
    });

    req.headers[lowercaseKey] = headerKeyValPairs[0].value;
  }

  req.getHeader = (name) => {
    return req.headers[name.toLowerCase()];
  };

  req.getHeaders = () => {
    return req.headers;
  };

  if (cfRequest.body && cfRequest.body.data) {
    req.push(
      cfRequest.body.data,
      cfRequest.body.encoding ? "base64" : undefined
    );
  }

  req.push(null);

  const res = new Stream__default['default']();
  res.finished = false;

  Object.defineProperty(res, "statusCode", {
    get() {
      return response.status;
    },
    set(statusCode) {
      response.status = statusCode;
      response.statusDescription = HttpStatusCodes[statusCode];
    }
  });

  res.headers = {};
  res.writeHead = (status, headers) => {
    response.status = status;

    if (headers) {
      res.headers = Object.assign(res.headers, headers);
    }
    return res;
  };
  res.write = (chunk) => {
    if (!response.body) {
      response.body = Buffer.from("");
    }

    response.body = Buffer.concat([
      response.body,
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    ]);
  };

  let shouldGzip = enableHTTPCompression && isGzipSupported(headers);

  const responsePromise = new Promise((resolve) => {
    res.end = (text) => {
      if (res.finished === true) {
        return;
      }

      res.finished = true;

      if (text) res.write(text);

      if (!res.statusCode) {
        res.statusCode = 200;
      }

      if (response.body) {
        response.bodyEncoding = "base64";
        response.body = shouldGzip
          ? zlib__default['default'].gzipSync(response.body).toString("base64")
          : Buffer.from(response.body).toString("base64");
      }

      response.headers = toCloudFrontHeaders(res.headers, cfResponse.headers);

      if (shouldGzip) {
        response.headers["content-encoding"] = [
          { key: "Content-Encoding", value: "gzip" }
        ];
      }
      resolve(response);
    };
  });

  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  res.removeHeader = (name) => {
    delete res.headers[name.toLowerCase()];
  };
  res.getHeader = (name) => {
    return res.headers[name.toLowerCase()];
  };
  res.getHeaders = () => {
    return res.headers;
  };
  res.hasHeader = (name) => {
    return !!res.getHeader(name);
  };

  return {
    req,
    res,
    responsePromise
  };
};

handler.SPECIAL_NODE_HEADERS = specialNodeHeaders;

var nextAwsCloudfront = handler;

/*!
 * cookie
 * Copyright(c) 2012-2014 Roman Shtylman
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module exports.
 * @public
 */

var parse_1 = parse;
var serialize_1 = serialize;

/**
 * Module variables.
 * @private
 */

var decode = decodeURIComponent;
var encode = encodeURIComponent;
var pairSplitRegExp = /; */;

/**
 * RegExp to match field-content in RFC 7230 sec 3.2
 *
 * field-content = field-vchar [ 1*( SP / HTAB ) field-vchar ]
 * field-vchar   = VCHAR / obs-text
 * obs-text      = %x80-FF
 */

var fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;

/**
 * Parse a cookie header.
 *
 * Parse the given cookie header string into an object
 * The object has the various cookies as keys(names) => values
 *
 * @param {string} str
 * @param {object} [options]
 * @return {object}
 * @public
 */

function parse(str, options) {
  if (typeof str !== 'string') {
    throw new TypeError('argument str must be a string');
  }

  var obj = {};
  var opt = options || {};
  var pairs = str.split(pairSplitRegExp);
  var dec = opt.decode || decode;

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var eq_idx = pair.indexOf('=');

    // skip things that don't look like key=value
    if (eq_idx < 0) {
      continue;
    }

    var key = pair.substr(0, eq_idx).trim();
    var val = pair.substr(++eq_idx, pair.length).trim();

    // quoted values
    if ('"' == val[0]) {
      val = val.slice(1, -1);
    }

    // only assign once
    if (undefined == obj[key]) {
      obj[key] = tryDecode(val, dec);
    }
  }

  return obj;
}

/**
 * Serialize data into a cookie header.
 *
 * Serialize the a name value pair into a cookie string suitable for
 * http headers. An optional options object specified cookie parameters.
 *
 * serialize('foo', 'bar', { httpOnly: true })
 *   => "foo=bar; httpOnly"
 *
 * @param {string} name
 * @param {string} val
 * @param {object} [options]
 * @return {string}
 * @public
 */

function serialize(name, val, options) {
  var opt = options || {};
  var enc = opt.encode || encode;

  if (typeof enc !== 'function') {
    throw new TypeError('option encode is invalid');
  }

  if (!fieldContentRegExp.test(name)) {
    throw new TypeError('argument name is invalid');
  }

  var value = enc(val);

  if (value && !fieldContentRegExp.test(value)) {
    throw new TypeError('argument val is invalid');
  }

  var str = name + '=' + value;

  if (null != opt.maxAge) {
    var maxAge = opt.maxAge - 0;

    if (isNaN(maxAge) || !isFinite(maxAge)) {
      throw new TypeError('option maxAge is invalid')
    }

    str += '; Max-Age=' + Math.floor(maxAge);
  }

  if (opt.domain) {
    if (!fieldContentRegExp.test(opt.domain)) {
      throw new TypeError('option domain is invalid');
    }

    str += '; Domain=' + opt.domain;
  }

  if (opt.path) {
    if (!fieldContentRegExp.test(opt.path)) {
      throw new TypeError('option path is invalid');
    }

    str += '; Path=' + opt.path;
  }

  if (opt.expires) {
    if (typeof opt.expires.toUTCString !== 'function') {
      throw new TypeError('option expires is invalid');
    }

    str += '; Expires=' + opt.expires.toUTCString();
  }

  if (opt.httpOnly) {
    str += '; HttpOnly';
  }

  if (opt.secure) {
    str += '; Secure';
  }

  if (opt.sameSite) {
    var sameSite = typeof opt.sameSite === 'string'
      ? opt.sameSite.toLowerCase() : opt.sameSite;

    switch (sameSite) {
      case true:
        str += '; SameSite=Strict';
        break;
      case 'lax':
        str += '; SameSite=Lax';
        break;
      case 'strict':
        str += '; SameSite=Strict';
        break;
      case 'none':
        str += '; SameSite=None';
        break;
      default:
        throw new TypeError('option sameSite is invalid');
    }
  }

  return str;
}

/**
 * Try decoding a string using a decoding function.
 *
 * @param {string} str
 * @param {function} decode
 * @private
 */

function tryDecode(str, decode) {
  try {
    return decode(str);
  } catch (e) {
    return str;
  }
}

var cookie = {
	parse: parse_1,
	serialize: serialize_1
};

function createCommonjsModule(fn, basedir, module) {
	return module = {
	  path: basedir,
	  exports: {},
	  require: function (path, base) {
      return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
    }
	}, fn(module, module.exports), module.exports;
}

function commonjsRequire () {
	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
}

var safeBuffer = createCommonjsModule(function (module, exports) {
/*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
/* eslint-disable node/no-deprecated-api */

var Buffer = buffer__default['default'].Buffer;

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key];
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer__default['default'];
} else {
  // Copy properties from require('buffer')
  copyProps(buffer__default['default'], exports);
  exports.Buffer = SafeBuffer;
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.prototype = Object.create(Buffer.prototype);

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer);

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
};

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size);
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding);
    } else {
      buf.fill(fill);
    }
  } else {
    buf.fill(0);
  }
  return buf
};

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
};

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer__default['default'].SlowBuffer(size)
};
});

/*global module, process*/
var Buffer$1 = safeBuffer.Buffer;



function DataStream(data) {
  this.buffer = null;
  this.writable = true;
  this.readable = true;

  // No input
  if (!data) {
    this.buffer = Buffer$1.alloc(0);
    return this;
  }

  // Stream
  if (typeof data.pipe === 'function') {
    this.buffer = Buffer$1.alloc(0);
    data.pipe(this);
    return this;
  }

  // Buffer or String
  // or Object (assumedly a passworded key)
  if (data.length || typeof data === 'object') {
    this.buffer = data;
    this.writable = false;
    process.nextTick(function () {
      this.emit('end', data);
      this.readable = false;
      this.emit('close');
    }.bind(this));
    return this;
  }

  throw new TypeError('Unexpected data type ('+ typeof data + ')');
}
util__default['default'].inherits(DataStream, Stream__default['default']);

DataStream.prototype.write = function write(data) {
  this.buffer = Buffer$1.concat([this.buffer, Buffer$1.from(data)]);
  this.emit('data', data);
};

DataStream.prototype.end = function end(data) {
  if (data)
    this.write(data);
  this.emit('end', data);
  this.emit('close');
  this.writable = false;
  this.readable = false;
};

var dataStream = DataStream;

var Buffer$2 = buffer__default['default'].Buffer; // browserify
var SlowBuffer = buffer__default['default'].SlowBuffer;

var bufferEqualConstantTime = bufferEq;

function bufferEq(a, b) {

  // shortcutting on type is necessary for correctness
  if (!Buffer$2.isBuffer(a) || !Buffer$2.isBuffer(b)) {
    return false;
  }

  // buffer sizes should be well-known information, so despite this
  // shortcutting, it doesn't leak any information about the *contents* of the
  // buffers.
  if (a.length !== b.length) {
    return false;
  }

  var c = 0;
  for (var i = 0; i < a.length; i++) {
    /*jshint bitwise:false */
    c |= a[i] ^ b[i]; // XOR
  }
  return c === 0;
}

bufferEq.install = function() {
  Buffer$2.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {
    return bufferEq(this, that);
  };
};

var origBufEqual = Buffer$2.prototype.equal;
var origSlowBufEqual = SlowBuffer.prototype.equal;
bufferEq.restore = function() {
  Buffer$2.prototype.equal = origBufEqual;
  SlowBuffer.prototype.equal = origSlowBufEqual;
};

function getParamSize(keySize) {
	var result = ((keySize / 8) | 0) + (keySize % 8 === 0 ? 0 : 1);
	return result;
}

var paramBytesForAlg = {
	ES256: getParamSize(256),
	ES384: getParamSize(384),
	ES512: getParamSize(521)
};

function getParamBytesForAlg(alg) {
	var paramBytes = paramBytesForAlg[alg];
	if (paramBytes) {
		return paramBytes;
	}

	throw new Error('Unknown algorithm "' + alg + '"');
}

var paramBytesForAlg_1 = getParamBytesForAlg;

var Buffer$3 = safeBuffer.Buffer;



var MAX_OCTET = 0x80,
	CLASS_UNIVERSAL = 0,
	PRIMITIVE_BIT = 0x20,
	TAG_SEQ = 0x10,
	TAG_INT = 0x02,
	ENCODED_TAG_SEQ = (TAG_SEQ | PRIMITIVE_BIT) | (CLASS_UNIVERSAL << 6),
	ENCODED_TAG_INT = TAG_INT | (CLASS_UNIVERSAL << 6);

function base64Url(base64) {
	return base64
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

function signatureAsBuffer(signature) {
	if (Buffer$3.isBuffer(signature)) {
		return signature;
	} else if ('string' === typeof signature) {
		return Buffer$3.from(signature, 'base64');
	}

	throw new TypeError('ECDSA signature must be a Base64 string or a Buffer');
}

function derToJose(signature, alg) {
	signature = signatureAsBuffer(signature);
	var paramBytes = paramBytesForAlg_1(alg);

	// the DER encoded param should at most be the param size, plus a padding
	// zero, since due to being a signed integer
	var maxEncodedParamLength = paramBytes + 1;

	var inputLength = signature.length;

	var offset = 0;
	if (signature[offset++] !== ENCODED_TAG_SEQ) {
		throw new Error('Could not find expected "seq"');
	}

	var seqLength = signature[offset++];
	if (seqLength === (MAX_OCTET | 1)) {
		seqLength = signature[offset++];
	}

	if (inputLength - offset < seqLength) {
		throw new Error('"seq" specified length of "' + seqLength + '", only "' + (inputLength - offset) + '" remaining');
	}

	if (signature[offset++] !== ENCODED_TAG_INT) {
		throw new Error('Could not find expected "int" for "r"');
	}

	var rLength = signature[offset++];

	if (inputLength - offset - 2 < rLength) {
		throw new Error('"r" specified length of "' + rLength + '", only "' + (inputLength - offset - 2) + '" available');
	}

	if (maxEncodedParamLength < rLength) {
		throw new Error('"r" specified length of "' + rLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
	}

	var rOffset = offset;
	offset += rLength;

	if (signature[offset++] !== ENCODED_TAG_INT) {
		throw new Error('Could not find expected "int" for "s"');
	}

	var sLength = signature[offset++];

	if (inputLength - offset !== sLength) {
		throw new Error('"s" specified length of "' + sLength + '", expected "' + (inputLength - offset) + '"');
	}

	if (maxEncodedParamLength < sLength) {
		throw new Error('"s" specified length of "' + sLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
	}

	var sOffset = offset;
	offset += sLength;

	if (offset !== inputLength) {
		throw new Error('Expected to consume entire buffer, but "' + (inputLength - offset) + '" bytes remain');
	}

	var rPadding = paramBytes - rLength,
		sPadding = paramBytes - sLength;

	var dst = Buffer$3.allocUnsafe(rPadding + rLength + sPadding + sLength);

	for (offset = 0; offset < rPadding; ++offset) {
		dst[offset] = 0;
	}
	signature.copy(dst, offset, rOffset + Math.max(-rPadding, 0), rOffset + rLength);

	offset = paramBytes;

	for (var o = offset; offset < o + sPadding; ++offset) {
		dst[offset] = 0;
	}
	signature.copy(dst, offset, sOffset + Math.max(-sPadding, 0), sOffset + sLength);

	dst = dst.toString('base64');
	dst = base64Url(dst);

	return dst;
}

function countPadding(buf, start, stop) {
	var padding = 0;
	while (start + padding < stop && buf[start + padding] === 0) {
		++padding;
	}

	var needsSign = buf[start + padding] >= MAX_OCTET;
	if (needsSign) {
		--padding;
	}

	return padding;
}

function joseToDer(signature, alg) {
	signature = signatureAsBuffer(signature);
	var paramBytes = paramBytesForAlg_1(alg);

	var signatureBytes = signature.length;
	if (signatureBytes !== paramBytes * 2) {
		throw new TypeError('"' + alg + '" signatures must be "' + paramBytes * 2 + '" bytes, saw "' + signatureBytes + '"');
	}

	var rPadding = countPadding(signature, 0, paramBytes);
	var sPadding = countPadding(signature, paramBytes, signature.length);
	var rLength = paramBytes - rPadding;
	var sLength = paramBytes - sPadding;

	var rsBytes = 1 + 1 + rLength + 1 + 1 + sLength;

	var shortLength = rsBytes < MAX_OCTET;

	var dst = Buffer$3.allocUnsafe((shortLength ? 2 : 3) + rsBytes);

	var offset = 0;
	dst[offset++] = ENCODED_TAG_SEQ;
	if (shortLength) {
		// Bit 8 has value "0"
		// bits 7-1 give the length.
		dst[offset++] = rsBytes;
	} else {
		// Bit 8 of first octet has value "1"
		// bits 7-1 give the number of additional length octets.
		dst[offset++] = MAX_OCTET	| 1;
		// length, base 256
		dst[offset++] = rsBytes & 0xff;
	}
	dst[offset++] = ENCODED_TAG_INT;
	dst[offset++] = rLength;
	if (rPadding < 0) {
		dst[offset++] = 0;
		offset += signature.copy(dst, offset, 0, paramBytes);
	} else {
		offset += signature.copy(dst, offset, rPadding, paramBytes);
	}
	dst[offset++] = ENCODED_TAG_INT;
	dst[offset++] = sLength;
	if (sPadding < 0) {
		dst[offset++] = 0;
		signature.copy(dst, offset, paramBytes);
	} else {
		signature.copy(dst, offset, paramBytes + sPadding);
	}

	return dst;
}

var ecdsaSigFormatter = {
	derToJose: derToJose,
	joseToDer: joseToDer
};

var Buffer$4 = safeBuffer.Buffer;




var MSG_INVALID_ALGORITHM = '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512" and "none".';
var MSG_INVALID_SECRET = 'secret must be a string or buffer';
var MSG_INVALID_VERIFIER_KEY = 'key must be a string or a buffer';
var MSG_INVALID_SIGNER_KEY = 'key must be a string, a buffer or an object';

var supportsKeyObjects = typeof crypto__default['default'].createPublicKey === 'function';
if (supportsKeyObjects) {
  MSG_INVALID_VERIFIER_KEY += ' or a KeyObject';
  MSG_INVALID_SECRET += 'or a KeyObject';
}

function checkIsPublicKey(key) {
  if (Buffer$4.isBuffer(key)) {
    return;
  }

  if (typeof key === 'string') {
    return;
  }

  if (!supportsKeyObjects) {
    throw typeError(MSG_INVALID_VERIFIER_KEY);
  }

  if (typeof key !== 'object') {
    throw typeError(MSG_INVALID_VERIFIER_KEY);
  }

  if (typeof key.type !== 'string') {
    throw typeError(MSG_INVALID_VERIFIER_KEY);
  }

  if (typeof key.asymmetricKeyType !== 'string') {
    throw typeError(MSG_INVALID_VERIFIER_KEY);
  }

  if (typeof key.export !== 'function') {
    throw typeError(MSG_INVALID_VERIFIER_KEY);
  }
}
function checkIsPrivateKey(key) {
  if (Buffer$4.isBuffer(key)) {
    return;
  }

  if (typeof key === 'string') {
    return;
  }

  if (typeof key === 'object') {
    return;
  }

  throw typeError(MSG_INVALID_SIGNER_KEY);
}
function checkIsSecretKey(key) {
  if (Buffer$4.isBuffer(key)) {
    return;
  }

  if (typeof key === 'string') {
    return key;
  }

  if (!supportsKeyObjects) {
    throw typeError(MSG_INVALID_SECRET);
  }

  if (typeof key !== 'object') {
    throw typeError(MSG_INVALID_SECRET);
  }

  if (key.type !== 'secret') {
    throw typeError(MSG_INVALID_SECRET);
  }

  if (typeof key.export !== 'function') {
    throw typeError(MSG_INVALID_SECRET);
  }
}

function fromBase64(base64) {
  return base64
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function toBase64(base64url) {
  base64url = base64url.toString();

  var padding = 4 - base64url.length % 4;
  if (padding !== 4) {
    for (var i = 0; i < padding; ++i) {
      base64url += '=';
    }
  }

  return base64url
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
}

function typeError(template) {
  var args = [].slice.call(arguments, 1);
  var errMsg = util__default['default'].format.bind(util__default['default'], template).apply(null, args);
  return new TypeError(errMsg);
}

function bufferOrString(obj) {
  return Buffer$4.isBuffer(obj) || typeof obj === 'string';
}

function normalizeInput(thing) {
  if (!bufferOrString(thing))
    thing = JSON.stringify(thing);
  return thing;
}

function createHmacSigner(bits) {
  return function sign(thing, secret) {
    checkIsSecretKey(secret);
    thing = normalizeInput(thing);
    var hmac = crypto__default['default'].createHmac('sha' + bits, secret);
    var sig = (hmac.update(thing), hmac.digest('base64'));
    return fromBase64(sig);
  }
}

function createHmacVerifier(bits) {
  return function verify(thing, signature, secret) {
    var computedSig = createHmacSigner(bits)(thing, secret);
    return bufferEqualConstantTime(Buffer$4.from(signature), Buffer$4.from(computedSig));
  }
}

function createKeySigner(bits) {
 return function sign(thing, privateKey) {
    checkIsPrivateKey(privateKey);
    thing = normalizeInput(thing);
    // Even though we are specifying "RSA" here, this works with ECDSA
    // keys as well.
    var signer = crypto__default['default'].createSign('RSA-SHA' + bits);
    var sig = (signer.update(thing), signer.sign(privateKey, 'base64'));
    return fromBase64(sig);
  }
}

function createKeyVerifier(bits) {
  return function verify(thing, signature, publicKey) {
    checkIsPublicKey(publicKey);
    thing = normalizeInput(thing);
    signature = toBase64(signature);
    var verifier = crypto__default['default'].createVerify('RSA-SHA' + bits);
    verifier.update(thing);
    return verifier.verify(publicKey, signature, 'base64');
  }
}

function createPSSKeySigner(bits) {
  return function sign(thing, privateKey) {
    checkIsPrivateKey(privateKey);
    thing = normalizeInput(thing);
    var signer = crypto__default['default'].createSign('RSA-SHA' + bits);
    var sig = (signer.update(thing), signer.sign({
      key: privateKey,
      padding: crypto__default['default'].constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto__default['default'].constants.RSA_PSS_SALTLEN_DIGEST
    }, 'base64'));
    return fromBase64(sig);
  }
}

function createPSSKeyVerifier(bits) {
  return function verify(thing, signature, publicKey) {
    checkIsPublicKey(publicKey);
    thing = normalizeInput(thing);
    signature = toBase64(signature);
    var verifier = crypto__default['default'].createVerify('RSA-SHA' + bits);
    verifier.update(thing);
    return verifier.verify({
      key: publicKey,
      padding: crypto__default['default'].constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto__default['default'].constants.RSA_PSS_SALTLEN_DIGEST
    }, signature, 'base64');
  }
}

function createECDSASigner(bits) {
  var inner = createKeySigner(bits);
  return function sign() {
    var signature = inner.apply(null, arguments);
    signature = ecdsaSigFormatter.derToJose(signature, 'ES' + bits);
    return signature;
  };
}

function createECDSAVerifer(bits) {
  var inner = createKeyVerifier(bits);
  return function verify(thing, signature, publicKey) {
    signature = ecdsaSigFormatter.joseToDer(signature, 'ES' + bits).toString('base64');
    var result = inner(thing, signature, publicKey);
    return result;
  };
}

function createNoneSigner() {
  return function sign() {
    return '';
  }
}

function createNoneVerifier() {
  return function verify(thing, signature) {
    return signature === '';
  }
}

var jwa = function jwa(algorithm) {
  var signerFactories = {
    hs: createHmacSigner,
    rs: createKeySigner,
    ps: createPSSKeySigner,
    es: createECDSASigner,
    none: createNoneSigner,
  };
  var verifierFactories = {
    hs: createHmacVerifier,
    rs: createKeyVerifier,
    ps: createPSSKeyVerifier,
    es: createECDSAVerifer,
    none: createNoneVerifier,
  };
  var match = algorithm.match(/^(RS|PS|ES|HS)(256|384|512)$|^(none)$/i);
  if (!match)
    throw typeError(MSG_INVALID_ALGORITHM, algorithm);
  var algo = (match[1] || match[3]).toLowerCase();
  var bits = match[2];

  return {
    sign: signerFactories[algo](bits),
    verify: verifierFactories[algo](bits),
  }
};

/*global module*/
var Buffer$5 = buffer__default['default'].Buffer;

var tostring = function toString(obj) {
  if (typeof obj === 'string')
    return obj;
  if (typeof obj === 'number' || Buffer$5.isBuffer(obj))
    return obj.toString();
  return JSON.stringify(obj);
};

/*global module*/
var Buffer$6 = safeBuffer.Buffer;






function base64url(string, encoding) {
  return Buffer$6
    .from(string, encoding)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function jwsSecuredInput(header, payload, encoding) {
  encoding = encoding || 'utf8';
  var encodedHeader = base64url(tostring(header), 'binary');
  var encodedPayload = base64url(tostring(payload), encoding);
  return util__default['default'].format('%s.%s', encodedHeader, encodedPayload);
}

function jwsSign(opts) {
  var header = opts.header;
  var payload = opts.payload;
  var secretOrKey = opts.secret || opts.privateKey;
  var encoding = opts.encoding;
  var algo = jwa(header.alg);
  var securedInput = jwsSecuredInput(header, payload, encoding);
  var signature = algo.sign(securedInput, secretOrKey);
  return util__default['default'].format('%s.%s', securedInput, signature);
}

function SignStream(opts) {
  var secret = opts.secret||opts.privateKey||opts.key;
  var secretStream = new dataStream(secret);
  this.readable = true;
  this.header = opts.header;
  this.encoding = opts.encoding;
  this.secret = this.privateKey = this.key = secretStream;
  this.payload = new dataStream(opts.payload);
  this.secret.once('close', function () {
    if (!this.payload.writable && this.readable)
      this.sign();
  }.bind(this));

  this.payload.once('close', function () {
    if (!this.secret.writable && this.readable)
      this.sign();
  }.bind(this));
}
util__default['default'].inherits(SignStream, Stream__default['default']);

SignStream.prototype.sign = function sign() {
  try {
    var signature = jwsSign({
      header: this.header,
      payload: this.payload.buffer,
      secret: this.secret.buffer,
      encoding: this.encoding
    });
    this.emit('done', signature);
    this.emit('data', signature);
    this.emit('end');
    this.readable = false;
    return signature;
  } catch (e) {
    this.readable = false;
    this.emit('error', e);
    this.emit('close');
  }
};

SignStream.sign = jwsSign;

var signStream = SignStream;

/*global module*/
var Buffer$7 = safeBuffer.Buffer;





var JWS_REGEX = /^[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?$/;

function isObject(thing) {
  return Object.prototype.toString.call(thing) === '[object Object]';
}

function safeJsonParse(thing) {
  if (isObject(thing))
    return thing;
  try { return JSON.parse(thing); }
  catch (e) { return undefined; }
}

function headerFromJWS(jwsSig) {
  var encodedHeader = jwsSig.split('.', 1)[0];
  return safeJsonParse(Buffer$7.from(encodedHeader, 'base64').toString('binary'));
}

function securedInputFromJWS(jwsSig) {
  return jwsSig.split('.', 2).join('.');
}

function signatureFromJWS(jwsSig) {
  return jwsSig.split('.')[2];
}

function payloadFromJWS(jwsSig, encoding) {
  encoding = encoding || 'utf8';
  var payload = jwsSig.split('.')[1];
  return Buffer$7.from(payload, 'base64').toString(encoding);
}

function isValidJws(string) {
  return JWS_REGEX.test(string) && !!headerFromJWS(string);
}

function jwsVerify(jwsSig, algorithm, secretOrKey) {
  if (!algorithm) {
    var err = new Error("Missing algorithm parameter for jws.verify");
    err.code = "MISSING_ALGORITHM";
    throw err;
  }
  jwsSig = tostring(jwsSig);
  var signature = signatureFromJWS(jwsSig);
  var securedInput = securedInputFromJWS(jwsSig);
  var algo = jwa(algorithm);
  return algo.verify(securedInput, signature, secretOrKey);
}

function jwsDecode(jwsSig, opts) {
  opts = opts || {};
  jwsSig = tostring(jwsSig);

  if (!isValidJws(jwsSig))
    return null;

  var header = headerFromJWS(jwsSig);

  if (!header)
    return null;

  var payload = payloadFromJWS(jwsSig);
  if (header.typ === 'JWT' || opts.json)
    payload = JSON.parse(payload, opts.encoding);

  return {
    header: header,
    payload: payload,
    signature: signatureFromJWS(jwsSig)
  };
}

function VerifyStream(opts) {
  opts = opts || {};
  var secretOrKey = opts.secret||opts.publicKey||opts.key;
  var secretStream = new dataStream(secretOrKey);
  this.readable = true;
  this.algorithm = opts.algorithm;
  this.encoding = opts.encoding;
  this.secret = this.publicKey = this.key = secretStream;
  this.signature = new dataStream(opts.signature);
  this.secret.once('close', function () {
    if (!this.signature.writable && this.readable)
      this.verify();
  }.bind(this));

  this.signature.once('close', function () {
    if (!this.secret.writable && this.readable)
      this.verify();
  }.bind(this));
}
util__default['default'].inherits(VerifyStream, Stream__default['default']);
VerifyStream.prototype.verify = function verify() {
  try {
    var valid = jwsVerify(this.signature.buffer, this.algorithm, this.key.buffer);
    var obj = jwsDecode(this.signature.buffer, this.encoding);
    this.emit('done', valid, obj);
    this.emit('data', valid);
    this.emit('end');
    this.readable = false;
    return valid;
  } catch (e) {
    this.readable = false;
    this.emit('error', e);
    this.emit('close');
  }
};

VerifyStream.decode = jwsDecode;
VerifyStream.isValid = isValidJws;
VerifyStream.verify = jwsVerify;

var verifyStream = VerifyStream;

/*global exports*/



var ALGORITHMS = [
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512'
];

var ALGORITHMS_1 = ALGORITHMS;
var sign = signStream.sign;
var verify = verifyStream.verify;
var decode$1 = verifyStream.decode;
var isValid = verifyStream.isValid;
var createSign = function createSign(opts) {
  return new signStream(opts);
};
var createVerify = function createVerify(opts) {
  return new verifyStream(opts);
};

var jws = {
	ALGORITHMS: ALGORITHMS_1,
	sign: sign,
	verify: verify,
	decode: decode$1,
	isValid: isValid,
	createSign: createSign,
	createVerify: createVerify
};

var decode$2 = function (jwt, options) {
  options = options || {};
  var decoded = jws.decode(jwt, options);
  if (!decoded) { return null; }
  var payload = decoded.payload;

  //try parse the payload
  if(typeof payload === 'string') {
    try {
      var obj = JSON.parse(payload);
      if(obj !== null && typeof obj === 'object') {
        payload = obj;
      }
    } catch (e) { }
  }

  //return header if `complete` option is enabled.  header includes claims
  //such as `kid` and `alg` used to select the key within a JWKS needed to
  //verify the signature
  if (options.complete === true) {
    return {
      header: decoded.header,
      payload: payload,
      signature: decoded.signature
    };
  }
  return payload;
};

var JsonWebTokenError = function (message, error) {
  Error.call(this, message);
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  }
  this.name = 'JsonWebTokenError';
  this.message = message;
  if (error) this.inner = error;
};

JsonWebTokenError.prototype = Object.create(Error.prototype);
JsonWebTokenError.prototype.constructor = JsonWebTokenError;

var JsonWebTokenError_1 = JsonWebTokenError;

var NotBeforeError = function (message, date) {
  JsonWebTokenError_1.call(this, message);
  this.name = 'NotBeforeError';
  this.date = date;
};

NotBeforeError.prototype = Object.create(JsonWebTokenError_1.prototype);

NotBeforeError.prototype.constructor = NotBeforeError;

var NotBeforeError_1 = NotBeforeError;

var TokenExpiredError = function (message, expiredAt) {
  JsonWebTokenError_1.call(this, message);
  this.name = 'TokenExpiredError';
  this.expiredAt = expiredAt;
};

TokenExpiredError.prototype = Object.create(JsonWebTokenError_1.prototype);

TokenExpiredError.prototype.constructor = TokenExpiredError;

var TokenExpiredError_1 = TokenExpiredError;

/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var w = d * 7;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

var ms = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse$1(val);
  } else if (type === 'number' && isFinite(val)) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse$1(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (msAbs >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (msAbs >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (msAbs >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, msAbs, n, name) {
  var isPlural = msAbs >= n * 1.5;
  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
}

var timespan = function (time, iat) {
  var timestamp = iat || Math.floor(Date.now() / 1000);

  if (typeof time === 'string') {
    var milliseconds = ms(time);
    if (typeof milliseconds === 'undefined') {
      return;
    }
    return Math.floor(timestamp + milliseconds / 1000);
  } else if (typeof time === 'number') {
    return timestamp + time;
  } else {
    return;
  }

};

var semver = createCommonjsModule(function (module, exports) {
exports = module.exports = SemVer;

var debug;
/* istanbul ignore next */
if (typeof process === 'object' &&
    process.env &&
    process.env.NODE_DEBUG &&
    /\bsemver\b/i.test(process.env.NODE_DEBUG)) {
  debug = function () {
    var args = Array.prototype.slice.call(arguments, 0);
    args.unshift('SEMVER');
    console.log.apply(console, args);
  };
} else {
  debug = function () {};
}

// Note: this is the semver.org version of the spec that it implements
// Not necessarily the package version of this code.
exports.SEMVER_SPEC_VERSION = '2.0.0';

var MAX_LENGTH = 256;
var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER ||
  /* istanbul ignore next */ 9007199254740991;

// Max safe segment length for coercion.
var MAX_SAFE_COMPONENT_LENGTH = 16;

// The actual regexps go on exports.re
var re = exports.re = [];
var src = exports.src = [];
var R = 0;

// The following Regular Expressions can be used for tokenizing,
// validating, and parsing SemVer version strings.

// ## Numeric Identifier
// A single `0`, or a non-zero digit followed by zero or more digits.

var NUMERICIDENTIFIER = R++;
src[NUMERICIDENTIFIER] = '0|[1-9]\\d*';
var NUMERICIDENTIFIERLOOSE = R++;
src[NUMERICIDENTIFIERLOOSE] = '[0-9]+';

// ## Non-numeric Identifier
// Zero or more digits, followed by a letter or hyphen, and then zero or
// more letters, digits, or hyphens.

var NONNUMERICIDENTIFIER = R++;
src[NONNUMERICIDENTIFIER] = '\\d*[a-zA-Z-][a-zA-Z0-9-]*';

// ## Main Version
// Three dot-separated numeric identifiers.

var MAINVERSION = R++;
src[MAINVERSION] = '(' + src[NUMERICIDENTIFIER] + ')\\.' +
                   '(' + src[NUMERICIDENTIFIER] + ')\\.' +
                   '(' + src[NUMERICIDENTIFIER] + ')';

var MAINVERSIONLOOSE = R++;
src[MAINVERSIONLOOSE] = '(' + src[NUMERICIDENTIFIERLOOSE] + ')\\.' +
                        '(' + src[NUMERICIDENTIFIERLOOSE] + ')\\.' +
                        '(' + src[NUMERICIDENTIFIERLOOSE] + ')';

// ## Pre-release Version Identifier
// A numeric identifier, or a non-numeric identifier.

var PRERELEASEIDENTIFIER = R++;
src[PRERELEASEIDENTIFIER] = '(?:' + src[NUMERICIDENTIFIER] +
                            '|' + src[NONNUMERICIDENTIFIER] + ')';

var PRERELEASEIDENTIFIERLOOSE = R++;
src[PRERELEASEIDENTIFIERLOOSE] = '(?:' + src[NUMERICIDENTIFIERLOOSE] +
                                 '|' + src[NONNUMERICIDENTIFIER] + ')';

// ## Pre-release Version
// Hyphen, followed by one or more dot-separated pre-release version
// identifiers.

var PRERELEASE = R++;
src[PRERELEASE] = '(?:-(' + src[PRERELEASEIDENTIFIER] +
                  '(?:\\.' + src[PRERELEASEIDENTIFIER] + ')*))';

var PRERELEASELOOSE = R++;
src[PRERELEASELOOSE] = '(?:-?(' + src[PRERELEASEIDENTIFIERLOOSE] +
                       '(?:\\.' + src[PRERELEASEIDENTIFIERLOOSE] + ')*))';

// ## Build Metadata Identifier
// Any combination of digits, letters, or hyphens.

var BUILDIDENTIFIER = R++;
src[BUILDIDENTIFIER] = '[0-9A-Za-z-]+';

// ## Build Metadata
// Plus sign, followed by one or more period-separated build metadata
// identifiers.

var BUILD = R++;
src[BUILD] = '(?:\\+(' + src[BUILDIDENTIFIER] +
             '(?:\\.' + src[BUILDIDENTIFIER] + ')*))';

// ## Full Version String
// A main version, followed optionally by a pre-release version and
// build metadata.

// Note that the only major, minor, patch, and pre-release sections of
// the version string are capturing groups.  The build metadata is not a
// capturing group, because it should not ever be used in version
// comparison.

var FULL = R++;
var FULLPLAIN = 'v?' + src[MAINVERSION] +
                src[PRERELEASE] + '?' +
                src[BUILD] + '?';

src[FULL] = '^' + FULLPLAIN + '$';

// like full, but allows v1.2.3 and =1.2.3, which people do sometimes.
// also, 1.0.0alpha1 (prerelease without the hyphen) which is pretty
// common in the npm registry.
var LOOSEPLAIN = '[v=\\s]*' + src[MAINVERSIONLOOSE] +
                 src[PRERELEASELOOSE] + '?' +
                 src[BUILD] + '?';

var LOOSE = R++;
src[LOOSE] = '^' + LOOSEPLAIN + '$';

var GTLT = R++;
src[GTLT] = '((?:<|>)?=?)';

// Something like "2.*" or "1.2.x".
// Note that "x.x" is a valid xRange identifer, meaning "any version"
// Only the first item is strictly required.
var XRANGEIDENTIFIERLOOSE = R++;
src[XRANGEIDENTIFIERLOOSE] = src[NUMERICIDENTIFIERLOOSE] + '|x|X|\\*';
var XRANGEIDENTIFIER = R++;
src[XRANGEIDENTIFIER] = src[NUMERICIDENTIFIER] + '|x|X|\\*';

var XRANGEPLAIN = R++;
src[XRANGEPLAIN] = '[v=\\s]*(' + src[XRANGEIDENTIFIER] + ')' +
                   '(?:\\.(' + src[XRANGEIDENTIFIER] + ')' +
                   '(?:\\.(' + src[XRANGEIDENTIFIER] + ')' +
                   '(?:' + src[PRERELEASE] + ')?' +
                   src[BUILD] + '?' +
                   ')?)?';

var XRANGEPLAINLOOSE = R++;
src[XRANGEPLAINLOOSE] = '[v=\\s]*(' + src[XRANGEIDENTIFIERLOOSE] + ')' +
                        '(?:\\.(' + src[XRANGEIDENTIFIERLOOSE] + ')' +
                        '(?:\\.(' + src[XRANGEIDENTIFIERLOOSE] + ')' +
                        '(?:' + src[PRERELEASELOOSE] + ')?' +
                        src[BUILD] + '?' +
                        ')?)?';

var XRANGE = R++;
src[XRANGE] = '^' + src[GTLT] + '\\s*' + src[XRANGEPLAIN] + '$';
var XRANGELOOSE = R++;
src[XRANGELOOSE] = '^' + src[GTLT] + '\\s*' + src[XRANGEPLAINLOOSE] + '$';

// Coercion.
// Extract anything that could conceivably be a part of a valid semver
var COERCE = R++;
src[COERCE] = '(?:^|[^\\d])' +
              '(\\d{1,' + MAX_SAFE_COMPONENT_LENGTH + '})' +
              '(?:\\.(\\d{1,' + MAX_SAFE_COMPONENT_LENGTH + '}))?' +
              '(?:\\.(\\d{1,' + MAX_SAFE_COMPONENT_LENGTH + '}))?' +
              '(?:$|[^\\d])';

// Tilde ranges.
// Meaning is "reasonably at or greater than"
var LONETILDE = R++;
src[LONETILDE] = '(?:~>?)';

var TILDETRIM = R++;
src[TILDETRIM] = '(\\s*)' + src[LONETILDE] + '\\s+';
re[TILDETRIM] = new RegExp(src[TILDETRIM], 'g');
var tildeTrimReplace = '$1~';

var TILDE = R++;
src[TILDE] = '^' + src[LONETILDE] + src[XRANGEPLAIN] + '$';
var TILDELOOSE = R++;
src[TILDELOOSE] = '^' + src[LONETILDE] + src[XRANGEPLAINLOOSE] + '$';

// Caret ranges.
// Meaning is "at least and backwards compatible with"
var LONECARET = R++;
src[LONECARET] = '(?:\\^)';

var CARETTRIM = R++;
src[CARETTRIM] = '(\\s*)' + src[LONECARET] + '\\s+';
re[CARETTRIM] = new RegExp(src[CARETTRIM], 'g');
var caretTrimReplace = '$1^';

var CARET = R++;
src[CARET] = '^' + src[LONECARET] + src[XRANGEPLAIN] + '$';
var CARETLOOSE = R++;
src[CARETLOOSE] = '^' + src[LONECARET] + src[XRANGEPLAINLOOSE] + '$';

// A simple gt/lt/eq thing, or just "" to indicate "any version"
var COMPARATORLOOSE = R++;
src[COMPARATORLOOSE] = '^' + src[GTLT] + '\\s*(' + LOOSEPLAIN + ')$|^$';
var COMPARATOR = R++;
src[COMPARATOR] = '^' + src[GTLT] + '\\s*(' + FULLPLAIN + ')$|^$';

// An expression to strip any whitespace between the gtlt and the thing
// it modifies, so that `> 1.2.3` ==> `>1.2.3`
var COMPARATORTRIM = R++;
src[COMPARATORTRIM] = '(\\s*)' + src[GTLT] +
                      '\\s*(' + LOOSEPLAIN + '|' + src[XRANGEPLAIN] + ')';

// this one has to use the /g flag
re[COMPARATORTRIM] = new RegExp(src[COMPARATORTRIM], 'g');
var comparatorTrimReplace = '$1$2$3';

// Something like `1.2.3 - 1.2.4`
// Note that these all use the loose form, because they'll be
// checked against either the strict or loose comparator form
// later.
var HYPHENRANGE = R++;
src[HYPHENRANGE] = '^\\s*(' + src[XRANGEPLAIN] + ')' +
                   '\\s+-\\s+' +
                   '(' + src[XRANGEPLAIN] + ')' +
                   '\\s*$';

var HYPHENRANGELOOSE = R++;
src[HYPHENRANGELOOSE] = '^\\s*(' + src[XRANGEPLAINLOOSE] + ')' +
                        '\\s+-\\s+' +
                        '(' + src[XRANGEPLAINLOOSE] + ')' +
                        '\\s*$';

// Star ranges basically just allow anything at all.
var STAR = R++;
src[STAR] = '(<|>)?=?\\s*\\*';

// Compile to actual regexp objects.
// All are flag-free, unless they were created above with a flag.
for (var i = 0; i < R; i++) {
  debug(i, src[i]);
  if (!re[i]) {
    re[i] = new RegExp(src[i]);
  }
}

exports.parse = parse;
function parse (version, options) {
  if (!options || typeof options !== 'object') {
    options = {
      loose: !!options,
      includePrerelease: false
    };
  }

  if (version instanceof SemVer) {
    return version
  }

  if (typeof version !== 'string') {
    return null
  }

  if (version.length > MAX_LENGTH) {
    return null
  }

  var r = options.loose ? re[LOOSE] : re[FULL];
  if (!r.test(version)) {
    return null
  }

  try {
    return new SemVer(version, options)
  } catch (er) {
    return null
  }
}

exports.valid = valid;
function valid (version, options) {
  var v = parse(version, options);
  return v ? v.version : null
}

exports.clean = clean;
function clean (version, options) {
  var s = parse(version.trim().replace(/^[=v]+/, ''), options);
  return s ? s.version : null
}

exports.SemVer = SemVer;

function SemVer (version, options) {
  if (!options || typeof options !== 'object') {
    options = {
      loose: !!options,
      includePrerelease: false
    };
  }
  if (version instanceof SemVer) {
    if (version.loose === options.loose) {
      return version
    } else {
      version = version.version;
    }
  } else if (typeof version !== 'string') {
    throw new TypeError('Invalid Version: ' + version)
  }

  if (version.length > MAX_LENGTH) {
    throw new TypeError('version is longer than ' + MAX_LENGTH + ' characters')
  }

  if (!(this instanceof SemVer)) {
    return new SemVer(version, options)
  }

  debug('SemVer', version, options);
  this.options = options;
  this.loose = !!options.loose;

  var m = version.trim().match(options.loose ? re[LOOSE] : re[FULL]);

  if (!m) {
    throw new TypeError('Invalid Version: ' + version)
  }

  this.raw = version;

  // these are actually numbers
  this.major = +m[1];
  this.minor = +m[2];
  this.patch = +m[3];

  if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
    throw new TypeError('Invalid major version')
  }

  if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
    throw new TypeError('Invalid minor version')
  }

  if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
    throw new TypeError('Invalid patch version')
  }

  // numberify any prerelease numeric ids
  if (!m[4]) {
    this.prerelease = [];
  } else {
    this.prerelease = m[4].split('.').map(function (id) {
      if (/^[0-9]+$/.test(id)) {
        var num = +id;
        if (num >= 0 && num < MAX_SAFE_INTEGER) {
          return num
        }
      }
      return id
    });
  }

  this.build = m[5] ? m[5].split('.') : [];
  this.format();
}

SemVer.prototype.format = function () {
  this.version = this.major + '.' + this.minor + '.' + this.patch;
  if (this.prerelease.length) {
    this.version += '-' + this.prerelease.join('.');
  }
  return this.version
};

SemVer.prototype.toString = function () {
  return this.version
};

SemVer.prototype.compare = function (other) {
  debug('SemVer.compare', this.version, this.options, other);
  if (!(other instanceof SemVer)) {
    other = new SemVer(other, this.options);
  }

  return this.compareMain(other) || this.comparePre(other)
};

SemVer.prototype.compareMain = function (other) {
  if (!(other instanceof SemVer)) {
    other = new SemVer(other, this.options);
  }

  return compareIdentifiers(this.major, other.major) ||
         compareIdentifiers(this.minor, other.minor) ||
         compareIdentifiers(this.patch, other.patch)
};

SemVer.prototype.comparePre = function (other) {
  if (!(other instanceof SemVer)) {
    other = new SemVer(other, this.options);
  }

  // NOT having a prerelease is > having one
  if (this.prerelease.length && !other.prerelease.length) {
    return -1
  } else if (!this.prerelease.length && other.prerelease.length) {
    return 1
  } else if (!this.prerelease.length && !other.prerelease.length) {
    return 0
  }

  var i = 0;
  do {
    var a = this.prerelease[i];
    var b = other.prerelease[i];
    debug('prerelease compare', i, a, b);
    if (a === undefined && b === undefined) {
      return 0
    } else if (b === undefined) {
      return 1
    } else if (a === undefined) {
      return -1
    } else if (a === b) {
      continue
    } else {
      return compareIdentifiers(a, b)
    }
  } while (++i)
};

// preminor will bump the version up to the next minor release, and immediately
// down to pre-release. premajor and prepatch work the same way.
SemVer.prototype.inc = function (release, identifier) {
  switch (release) {
    case 'premajor':
      this.prerelease.length = 0;
      this.patch = 0;
      this.minor = 0;
      this.major++;
      this.inc('pre', identifier);
      break
    case 'preminor':
      this.prerelease.length = 0;
      this.patch = 0;
      this.minor++;
      this.inc('pre', identifier);
      break
    case 'prepatch':
      // If this is already a prerelease, it will bump to the next version
      // drop any prereleases that might already exist, since they are not
      // relevant at this point.
      this.prerelease.length = 0;
      this.inc('patch', identifier);
      this.inc('pre', identifier);
      break
    // If the input is a non-prerelease version, this acts the same as
    // prepatch.
    case 'prerelease':
      if (this.prerelease.length === 0) {
        this.inc('patch', identifier);
      }
      this.inc('pre', identifier);
      break

    case 'major':
      // If this is a pre-major version, bump up to the same major version.
      // Otherwise increment major.
      // 1.0.0-5 bumps to 1.0.0
      // 1.1.0 bumps to 2.0.0
      if (this.minor !== 0 ||
          this.patch !== 0 ||
          this.prerelease.length === 0) {
        this.major++;
      }
      this.minor = 0;
      this.patch = 0;
      this.prerelease = [];
      break
    case 'minor':
      // If this is a pre-minor version, bump up to the same minor version.
      // Otherwise increment minor.
      // 1.2.0-5 bumps to 1.2.0
      // 1.2.1 bumps to 1.3.0
      if (this.patch !== 0 || this.prerelease.length === 0) {
        this.minor++;
      }
      this.patch = 0;
      this.prerelease = [];
      break
    case 'patch':
      // If this is not a pre-release version, it will increment the patch.
      // If it is a pre-release it will bump up to the same patch version.
      // 1.2.0-5 patches to 1.2.0
      // 1.2.0 patches to 1.2.1
      if (this.prerelease.length === 0) {
        this.patch++;
      }
      this.prerelease = [];
      break
    // This probably shouldn't be used publicly.
    // 1.0.0 "pre" would become 1.0.0-0 which is the wrong direction.
    case 'pre':
      if (this.prerelease.length === 0) {
        this.prerelease = [0];
      } else {
        var i = this.prerelease.length;
        while (--i >= 0) {
          if (typeof this.prerelease[i] === 'number') {
            this.prerelease[i]++;
            i = -2;
          }
        }
        if (i === -1) {
          // didn't increment anything
          this.prerelease.push(0);
        }
      }
      if (identifier) {
        // 1.2.0-beta.1 bumps to 1.2.0-beta.2,
        // 1.2.0-beta.fooblz or 1.2.0-beta bumps to 1.2.0-beta.0
        if (this.prerelease[0] === identifier) {
          if (isNaN(this.prerelease[1])) {
            this.prerelease = [identifier, 0];
          }
        } else {
          this.prerelease = [identifier, 0];
        }
      }
      break

    default:
      throw new Error('invalid increment argument: ' + release)
  }
  this.format();
  this.raw = this.version;
  return this
};

exports.inc = inc;
function inc (version, release, loose, identifier) {
  if (typeof (loose) === 'string') {
    identifier = loose;
    loose = undefined;
  }

  try {
    return new SemVer(version, loose).inc(release, identifier).version
  } catch (er) {
    return null
  }
}

exports.diff = diff;
function diff (version1, version2) {
  if (eq(version1, version2)) {
    return null
  } else {
    var v1 = parse(version1);
    var v2 = parse(version2);
    var prefix = '';
    if (v1.prerelease.length || v2.prerelease.length) {
      prefix = 'pre';
      var defaultResult = 'prerelease';
    }
    for (var key in v1) {
      if (key === 'major' || key === 'minor' || key === 'patch') {
        if (v1[key] !== v2[key]) {
          return prefix + key
        }
      }
    }
    return defaultResult // may be undefined
  }
}

exports.compareIdentifiers = compareIdentifiers;

var numeric = /^[0-9]+$/;
function compareIdentifiers (a, b) {
  var anum = numeric.test(a);
  var bnum = numeric.test(b);

  if (anum && bnum) {
    a = +a;
    b = +b;
  }

  return a === b ? 0
    : (anum && !bnum) ? -1
    : (bnum && !anum) ? 1
    : a < b ? -1
    : 1
}

exports.rcompareIdentifiers = rcompareIdentifiers;
function rcompareIdentifiers (a, b) {
  return compareIdentifiers(b, a)
}

exports.major = major;
function major (a, loose) {
  return new SemVer(a, loose).major
}

exports.minor = minor;
function minor (a, loose) {
  return new SemVer(a, loose).minor
}

exports.patch = patch;
function patch (a, loose) {
  return new SemVer(a, loose).patch
}

exports.compare = compare;
function compare (a, b, loose) {
  return new SemVer(a, loose).compare(new SemVer(b, loose))
}

exports.compareLoose = compareLoose;
function compareLoose (a, b) {
  return compare(a, b, true)
}

exports.rcompare = rcompare;
function rcompare (a, b, loose) {
  return compare(b, a, loose)
}

exports.sort = sort;
function sort (list, loose) {
  return list.sort(function (a, b) {
    return exports.compare(a, b, loose)
  })
}

exports.rsort = rsort;
function rsort (list, loose) {
  return list.sort(function (a, b) {
    return exports.rcompare(a, b, loose)
  })
}

exports.gt = gt;
function gt (a, b, loose) {
  return compare(a, b, loose) > 0
}

exports.lt = lt;
function lt (a, b, loose) {
  return compare(a, b, loose) < 0
}

exports.eq = eq;
function eq (a, b, loose) {
  return compare(a, b, loose) === 0
}

exports.neq = neq;
function neq (a, b, loose) {
  return compare(a, b, loose) !== 0
}

exports.gte = gte;
function gte (a, b, loose) {
  return compare(a, b, loose) >= 0
}

exports.lte = lte;
function lte (a, b, loose) {
  return compare(a, b, loose) <= 0
}

exports.cmp = cmp;
function cmp (a, op, b, loose) {
  switch (op) {
    case '===':
      if (typeof a === 'object')
        a = a.version;
      if (typeof b === 'object')
        b = b.version;
      return a === b

    case '!==':
      if (typeof a === 'object')
        a = a.version;
      if (typeof b === 'object')
        b = b.version;
      return a !== b

    case '':
    case '=':
    case '==':
      return eq(a, b, loose)

    case '!=':
      return neq(a, b, loose)

    case '>':
      return gt(a, b, loose)

    case '>=':
      return gte(a, b, loose)

    case '<':
      return lt(a, b, loose)

    case '<=':
      return lte(a, b, loose)

    default:
      throw new TypeError('Invalid operator: ' + op)
  }
}

exports.Comparator = Comparator;
function Comparator (comp, options) {
  if (!options || typeof options !== 'object') {
    options = {
      loose: !!options,
      includePrerelease: false
    };
  }

  if (comp instanceof Comparator) {
    if (comp.loose === !!options.loose) {
      return comp
    } else {
      comp = comp.value;
    }
  }

  if (!(this instanceof Comparator)) {
    return new Comparator(comp, options)
  }

  debug('comparator', comp, options);
  this.options = options;
  this.loose = !!options.loose;
  this.parse(comp);

  if (this.semver === ANY) {
    this.value = '';
  } else {
    this.value = this.operator + this.semver.version;
  }

  debug('comp', this);
}

var ANY = {};
Comparator.prototype.parse = function (comp) {
  var r = this.options.loose ? re[COMPARATORLOOSE] : re[COMPARATOR];
  var m = comp.match(r);

  if (!m) {
    throw new TypeError('Invalid comparator: ' + comp)
  }

  this.operator = m[1];
  if (this.operator === '=') {
    this.operator = '';
  }

  // if it literally is just '>' or '' then allow anything.
  if (!m[2]) {
    this.semver = ANY;
  } else {
    this.semver = new SemVer(m[2], this.options.loose);
  }
};

Comparator.prototype.toString = function () {
  return this.value
};

Comparator.prototype.test = function (version) {
  debug('Comparator.test', version, this.options.loose);

  if (this.semver === ANY) {
    return true
  }

  if (typeof version === 'string') {
    version = new SemVer(version, this.options);
  }

  return cmp(version, this.operator, this.semver, this.options)
};

Comparator.prototype.intersects = function (comp, options) {
  if (!(comp instanceof Comparator)) {
    throw new TypeError('a Comparator is required')
  }

  if (!options || typeof options !== 'object') {
    options = {
      loose: !!options,
      includePrerelease: false
    };
  }

  var rangeTmp;

  if (this.operator === '') {
    rangeTmp = new Range(comp.value, options);
    return satisfies(this.value, rangeTmp, options)
  } else if (comp.operator === '') {
    rangeTmp = new Range(this.value, options);
    return satisfies(comp.semver, rangeTmp, options)
  }

  var sameDirectionIncreasing =
    (this.operator === '>=' || this.operator === '>') &&
    (comp.operator === '>=' || comp.operator === '>');
  var sameDirectionDecreasing =
    (this.operator === '<=' || this.operator === '<') &&
    (comp.operator === '<=' || comp.operator === '<');
  var sameSemVer = this.semver.version === comp.semver.version;
  var differentDirectionsInclusive =
    (this.operator === '>=' || this.operator === '<=') &&
    (comp.operator === '>=' || comp.operator === '<=');
  var oppositeDirectionsLessThan =
    cmp(this.semver, '<', comp.semver, options) &&
    ((this.operator === '>=' || this.operator === '>') &&
    (comp.operator === '<=' || comp.operator === '<'));
  var oppositeDirectionsGreaterThan =
    cmp(this.semver, '>', comp.semver, options) &&
    ((this.operator === '<=' || this.operator === '<') &&
    (comp.operator === '>=' || comp.operator === '>'));

  return sameDirectionIncreasing || sameDirectionDecreasing ||
    (sameSemVer && differentDirectionsInclusive) ||
    oppositeDirectionsLessThan || oppositeDirectionsGreaterThan
};

exports.Range = Range;
function Range (range, options) {
  if (!options || typeof options !== 'object') {
    options = {
      loose: !!options,
      includePrerelease: false
    };
  }

  if (range instanceof Range) {
    if (range.loose === !!options.loose &&
        range.includePrerelease === !!options.includePrerelease) {
      return range
    } else {
      return new Range(range.raw, options)
    }
  }

  if (range instanceof Comparator) {
    return new Range(range.value, options)
  }

  if (!(this instanceof Range)) {
    return new Range(range, options)
  }

  this.options = options;
  this.loose = !!options.loose;
  this.includePrerelease = !!options.includePrerelease;

  // First, split based on boolean or ||
  this.raw = range;
  this.set = range.split(/\s*\|\|\s*/).map(function (range) {
    return this.parseRange(range.trim())
  }, this).filter(function (c) {
    // throw out any that are not relevant for whatever reason
    return c.length
  });

  if (!this.set.length) {
    throw new TypeError('Invalid SemVer Range: ' + range)
  }

  this.format();
}

Range.prototype.format = function () {
  this.range = this.set.map(function (comps) {
    return comps.join(' ').trim()
  }).join('||').trim();
  return this.range
};

Range.prototype.toString = function () {
  return this.range
};

Range.prototype.parseRange = function (range) {
  var loose = this.options.loose;
  range = range.trim();
  // `1.2.3 - 1.2.4` => `>=1.2.3 <=1.2.4`
  var hr = loose ? re[HYPHENRANGELOOSE] : re[HYPHENRANGE];
  range = range.replace(hr, hyphenReplace);
  debug('hyphen replace', range);
  // `> 1.2.3 < 1.2.5` => `>1.2.3 <1.2.5`
  range = range.replace(re[COMPARATORTRIM], comparatorTrimReplace);
  debug('comparator trim', range, re[COMPARATORTRIM]);

  // `~ 1.2.3` => `~1.2.3`
  range = range.replace(re[TILDETRIM], tildeTrimReplace);

  // `^ 1.2.3` => `^1.2.3`
  range = range.replace(re[CARETTRIM], caretTrimReplace);

  // normalize spaces
  range = range.split(/\s+/).join(' ');

  // At this point, the range is completely trimmed and
  // ready to be split into comparators.

  var compRe = loose ? re[COMPARATORLOOSE] : re[COMPARATOR];
  var set = range.split(' ').map(function (comp) {
    return parseComparator(comp, this.options)
  }, this).join(' ').split(/\s+/);
  if (this.options.loose) {
    // in loose mode, throw out any that are not valid comparators
    set = set.filter(function (comp) {
      return !!comp.match(compRe)
    });
  }
  set = set.map(function (comp) {
    return new Comparator(comp, this.options)
  }, this);

  return set
};

Range.prototype.intersects = function (range, options) {
  if (!(range instanceof Range)) {
    throw new TypeError('a Range is required')
  }

  return this.set.some(function (thisComparators) {
    return thisComparators.every(function (thisComparator) {
      return range.set.some(function (rangeComparators) {
        return rangeComparators.every(function (rangeComparator) {
          return thisComparator.intersects(rangeComparator, options)
        })
      })
    })
  })
};

// Mostly just for testing and legacy API reasons
exports.toComparators = toComparators;
function toComparators (range, options) {
  return new Range(range, options).set.map(function (comp) {
    return comp.map(function (c) {
      return c.value
    }).join(' ').trim().split(' ')
  })
}

// comprised of xranges, tildes, stars, and gtlt's at this point.
// already replaced the hyphen ranges
// turn into a set of JUST comparators.
function parseComparator (comp, options) {
  debug('comp', comp, options);
  comp = replaceCarets(comp, options);
  debug('caret', comp);
  comp = replaceTildes(comp, options);
  debug('tildes', comp);
  comp = replaceXRanges(comp, options);
  debug('xrange', comp);
  comp = replaceStars(comp, options);
  debug('stars', comp);
  return comp
}

function isX (id) {
  return !id || id.toLowerCase() === 'x' || id === '*'
}

// ~, ~> --> * (any, kinda silly)
// ~2, ~2.x, ~2.x.x, ~>2, ~>2.x ~>2.x.x --> >=2.0.0 <3.0.0
// ~2.0, ~2.0.x, ~>2.0, ~>2.0.x --> >=2.0.0 <2.1.0
// ~1.2, ~1.2.x, ~>1.2, ~>1.2.x --> >=1.2.0 <1.3.0
// ~1.2.3, ~>1.2.3 --> >=1.2.3 <1.3.0
// ~1.2.0, ~>1.2.0 --> >=1.2.0 <1.3.0
function replaceTildes (comp, options) {
  return comp.trim().split(/\s+/).map(function (comp) {
    return replaceTilde(comp, options)
  }).join(' ')
}

function replaceTilde (comp, options) {
  var r = options.loose ? re[TILDELOOSE] : re[TILDE];
  return comp.replace(r, function (_, M, m, p, pr) {
    debug('tilde', comp, _, M, m, p, pr);
    var ret;

    if (isX(M)) {
      ret = '';
    } else if (isX(m)) {
      ret = '>=' + M + '.0.0 <' + (+M + 1) + '.0.0';
    } else if (isX(p)) {
      // ~1.2 == >=1.2.0 <1.3.0
      ret = '>=' + M + '.' + m + '.0 <' + M + '.' + (+m + 1) + '.0';
    } else if (pr) {
      debug('replaceTilde pr', pr);
      ret = '>=' + M + '.' + m + '.' + p + '-' + pr +
            ' <' + M + '.' + (+m + 1) + '.0';
    } else {
      // ~1.2.3 == >=1.2.3 <1.3.0
      ret = '>=' + M + '.' + m + '.' + p +
            ' <' + M + '.' + (+m + 1) + '.0';
    }

    debug('tilde return', ret);
    return ret
  })
}

// ^ --> * (any, kinda silly)
// ^2, ^2.x, ^2.x.x --> >=2.0.0 <3.0.0
// ^2.0, ^2.0.x --> >=2.0.0 <3.0.0
// ^1.2, ^1.2.x --> >=1.2.0 <2.0.0
// ^1.2.3 --> >=1.2.3 <2.0.0
// ^1.2.0 --> >=1.2.0 <2.0.0
function replaceCarets (comp, options) {
  return comp.trim().split(/\s+/).map(function (comp) {
    return replaceCaret(comp, options)
  }).join(' ')
}

function replaceCaret (comp, options) {
  debug('caret', comp, options);
  var r = options.loose ? re[CARETLOOSE] : re[CARET];
  return comp.replace(r, function (_, M, m, p, pr) {
    debug('caret', comp, _, M, m, p, pr);
    var ret;

    if (isX(M)) {
      ret = '';
    } else if (isX(m)) {
      ret = '>=' + M + '.0.0 <' + (+M + 1) + '.0.0';
    } else if (isX(p)) {
      if (M === '0') {
        ret = '>=' + M + '.' + m + '.0 <' + M + '.' + (+m + 1) + '.0';
      } else {
        ret = '>=' + M + '.' + m + '.0 <' + (+M + 1) + '.0.0';
      }
    } else if (pr) {
      debug('replaceCaret pr', pr);
      if (M === '0') {
        if (m === '0') {
          ret = '>=' + M + '.' + m + '.' + p + '-' + pr +
                ' <' + M + '.' + m + '.' + (+p + 1);
        } else {
          ret = '>=' + M + '.' + m + '.' + p + '-' + pr +
                ' <' + M + '.' + (+m + 1) + '.0';
        }
      } else {
        ret = '>=' + M + '.' + m + '.' + p + '-' + pr +
              ' <' + (+M + 1) + '.0.0';
      }
    } else {
      debug('no pr');
      if (M === '0') {
        if (m === '0') {
          ret = '>=' + M + '.' + m + '.' + p +
                ' <' + M + '.' + m + '.' + (+p + 1);
        } else {
          ret = '>=' + M + '.' + m + '.' + p +
                ' <' + M + '.' + (+m + 1) + '.0';
        }
      } else {
        ret = '>=' + M + '.' + m + '.' + p +
              ' <' + (+M + 1) + '.0.0';
      }
    }

    debug('caret return', ret);
    return ret
  })
}

function replaceXRanges (comp, options) {
  debug('replaceXRanges', comp, options);
  return comp.split(/\s+/).map(function (comp) {
    return replaceXRange(comp, options)
  }).join(' ')
}

function replaceXRange (comp, options) {
  comp = comp.trim();
  var r = options.loose ? re[XRANGELOOSE] : re[XRANGE];
  return comp.replace(r, function (ret, gtlt, M, m, p, pr) {
    debug('xRange', comp, ret, gtlt, M, m, p, pr);
    var xM = isX(M);
    var xm = xM || isX(m);
    var xp = xm || isX(p);
    var anyX = xp;

    if (gtlt === '=' && anyX) {
      gtlt = '';
    }

    if (xM) {
      if (gtlt === '>' || gtlt === '<') {
        // nothing is allowed
        ret = '<0.0.0';
      } else {
        // nothing is forbidden
        ret = '*';
      }
    } else if (gtlt && anyX) {
      // we know patch is an x, because we have any x at all.
      // replace X with 0
      if (xm) {
        m = 0;
      }
      p = 0;

      if (gtlt === '>') {
        // >1 => >=2.0.0
        // >1.2 => >=1.3.0
        // >1.2.3 => >= 1.2.4
        gtlt = '>=';
        if (xm) {
          M = +M + 1;
          m = 0;
          p = 0;
        } else {
          m = +m + 1;
          p = 0;
        }
      } else if (gtlt === '<=') {
        // <=0.7.x is actually <0.8.0, since any 0.7.x should
        // pass.  Similarly, <=7.x is actually <8.0.0, etc.
        gtlt = '<';
        if (xm) {
          M = +M + 1;
        } else {
          m = +m + 1;
        }
      }

      ret = gtlt + M + '.' + m + '.' + p;
    } else if (xm) {
      ret = '>=' + M + '.0.0 <' + (+M + 1) + '.0.0';
    } else if (xp) {
      ret = '>=' + M + '.' + m + '.0 <' + M + '.' + (+m + 1) + '.0';
    }

    debug('xRange return', ret);

    return ret
  })
}

// Because * is AND-ed with everything else in the comparator,
// and '' means "any version", just remove the *s entirely.
function replaceStars (comp, options) {
  debug('replaceStars', comp, options);
  // Looseness is ignored here.  star is always as loose as it gets!
  return comp.trim().replace(re[STAR], '')
}

// This function is passed to string.replace(re[HYPHENRANGE])
// M, m, patch, prerelease, build
// 1.2 - 3.4.5 => >=1.2.0 <=3.4.5
// 1.2.3 - 3.4 => >=1.2.0 <3.5.0 Any 3.4.x will do
// 1.2 - 3.4 => >=1.2.0 <3.5.0
function hyphenReplace ($0,
  from, fM, fm, fp, fpr, fb,
  to, tM, tm, tp, tpr, tb) {
  if (isX(fM)) {
    from = '';
  } else if (isX(fm)) {
    from = '>=' + fM + '.0.0';
  } else if (isX(fp)) {
    from = '>=' + fM + '.' + fm + '.0';
  } else {
    from = '>=' + from;
  }

  if (isX(tM)) {
    to = '';
  } else if (isX(tm)) {
    to = '<' + (+tM + 1) + '.0.0';
  } else if (isX(tp)) {
    to = '<' + tM + '.' + (+tm + 1) + '.0';
  } else if (tpr) {
    to = '<=' + tM + '.' + tm + '.' + tp + '-' + tpr;
  } else {
    to = '<=' + to;
  }

  return (from + ' ' + to).trim()
}

// if ANY of the sets match ALL of its comparators, then pass
Range.prototype.test = function (version) {
  if (!version) {
    return false
  }

  if (typeof version === 'string') {
    version = new SemVer(version, this.options);
  }

  for (var i = 0; i < this.set.length; i++) {
    if (testSet(this.set[i], version, this.options)) {
      return true
    }
  }
  return false
};

function testSet (set, version, options) {
  for (var i = 0; i < set.length; i++) {
    if (!set[i].test(version)) {
      return false
    }
  }

  if (version.prerelease.length && !options.includePrerelease) {
    // Find the set of versions that are allowed to have prereleases
    // For example, ^1.2.3-pr.1 desugars to >=1.2.3-pr.1 <2.0.0
    // That should allow `1.2.3-pr.2` to pass.
    // However, `1.2.4-alpha.notready` should NOT be allowed,
    // even though it's within the range set by the comparators.
    for (i = 0; i < set.length; i++) {
      debug(set[i].semver);
      if (set[i].semver === ANY) {
        continue
      }

      if (set[i].semver.prerelease.length > 0) {
        var allowed = set[i].semver;
        if (allowed.major === version.major &&
            allowed.minor === version.minor &&
            allowed.patch === version.patch) {
          return true
        }
      }
    }

    // Version has a -pre, but it's not one of the ones we like.
    return false
  }

  return true
}

exports.satisfies = satisfies;
function satisfies (version, range, options) {
  try {
    range = new Range(range, options);
  } catch (er) {
    return false
  }
  return range.test(version)
}

exports.maxSatisfying = maxSatisfying;
function maxSatisfying (versions, range, options) {
  var max = null;
  var maxSV = null;
  try {
    var rangeObj = new Range(range, options);
  } catch (er) {
    return null
  }
  versions.forEach(function (v) {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!max || maxSV.compare(v) === -1) {
        // compare(max, v, true)
        max = v;
        maxSV = new SemVer(max, options);
      }
    }
  });
  return max
}

exports.minSatisfying = minSatisfying;
function minSatisfying (versions, range, options) {
  var min = null;
  var minSV = null;
  try {
    var rangeObj = new Range(range, options);
  } catch (er) {
    return null
  }
  versions.forEach(function (v) {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!min || minSV.compare(v) === 1) {
        // compare(min, v, true)
        min = v;
        minSV = new SemVer(min, options);
      }
    }
  });
  return min
}

exports.minVersion = minVersion;
function minVersion (range, loose) {
  range = new Range(range, loose);

  var minver = new SemVer('0.0.0');
  if (range.test(minver)) {
    return minver
  }

  minver = new SemVer('0.0.0-0');
  if (range.test(minver)) {
    return minver
  }

  minver = null;
  for (var i = 0; i < range.set.length; ++i) {
    var comparators = range.set[i];

    comparators.forEach(function (comparator) {
      // Clone to avoid manipulating the comparator's semver object.
      var compver = new SemVer(comparator.semver.version);
      switch (comparator.operator) {
        case '>':
          if (compver.prerelease.length === 0) {
            compver.patch++;
          } else {
            compver.prerelease.push(0);
          }
          compver.raw = compver.format();
          /* fallthrough */
        case '':
        case '>=':
          if (!minver || gt(minver, compver)) {
            minver = compver;
          }
          break
        case '<':
        case '<=':
          /* Ignore maximum versions */
          break
        /* istanbul ignore next */
        default:
          throw new Error('Unexpected operation: ' + comparator.operator)
      }
    });
  }

  if (minver && range.test(minver)) {
    return minver
  }

  return null
}

exports.validRange = validRange;
function validRange (range, options) {
  try {
    // Return '*' instead of '' so that truthiness works.
    // This will throw if it's invalid anyway
    return new Range(range, options).range || '*'
  } catch (er) {
    return null
  }
}

// Determine if version is less than all the versions possible in the range
exports.ltr = ltr;
function ltr (version, range, options) {
  return outside(version, range, '<', options)
}

// Determine if version is greater than all the versions possible in the range.
exports.gtr = gtr;
function gtr (version, range, options) {
  return outside(version, range, '>', options)
}

exports.outside = outside;
function outside (version, range, hilo, options) {
  version = new SemVer(version, options);
  range = new Range(range, options);

  var gtfn, ltefn, ltfn, comp, ecomp;
  switch (hilo) {
    case '>':
      gtfn = gt;
      ltefn = lte;
      ltfn = lt;
      comp = '>';
      ecomp = '>=';
      break
    case '<':
      gtfn = lt;
      ltefn = gte;
      ltfn = gt;
      comp = '<';
      ecomp = '<=';
      break
    default:
      throw new TypeError('Must provide a hilo val of "<" or ">"')
  }

  // If it satisifes the range it is not outside
  if (satisfies(version, range, options)) {
    return false
  }

  // From now on, variable terms are as if we're in "gtr" mode.
  // but note that everything is flipped for the "ltr" function.

  for (var i = 0; i < range.set.length; ++i) {
    var comparators = range.set[i];

    var high = null;
    var low = null;

    comparators.forEach(function (comparator) {
      if (comparator.semver === ANY) {
        comparator = new Comparator('>=0.0.0');
      }
      high = high || comparator;
      low = low || comparator;
      if (gtfn(comparator.semver, high.semver, options)) {
        high = comparator;
      } else if (ltfn(comparator.semver, low.semver, options)) {
        low = comparator;
      }
    });

    // If the edge version comparator has a operator then our version
    // isn't outside it
    if (high.operator === comp || high.operator === ecomp) {
      return false
    }

    // If the lowest version comparator has an operator and our version
    // is less than it then it isn't higher than the range
    if ((!low.operator || low.operator === comp) &&
        ltefn(version, low.semver)) {
      return false
    } else if (low.operator === ecomp && ltfn(version, low.semver)) {
      return false
    }
  }
  return true
}

exports.prerelease = prerelease;
function prerelease (version, options) {
  var parsed = parse(version, options);
  return (parsed && parsed.prerelease.length) ? parsed.prerelease : null
}

exports.intersects = intersects;
function intersects (r1, r2, options) {
  r1 = new Range(r1, options);
  r2 = new Range(r2, options);
  return r1.intersects(r2)
}

exports.coerce = coerce;
function coerce (version) {
  if (version instanceof SemVer) {
    return version
  }

  if (typeof version !== 'string') {
    return null
  }

  var match = version.match(re[COERCE]);

  if (match == null) {
    return null
  }

  return parse(match[1] +
    '.' + (match[2] || '0') +
    '.' + (match[3] || '0'))
}
});

var psSupported = semver.satisfies(process.version, '^6.12.0 || >=8.0.0');

var PUB_KEY_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];
var RSA_KEY_ALGS = ['RS256', 'RS384', 'RS512'];
var HS_ALGS = ['HS256', 'HS384', 'HS512'];

if (psSupported) {
  PUB_KEY_ALGS.splice(3, 0, 'PS256', 'PS384', 'PS512');
  RSA_KEY_ALGS.splice(3, 0, 'PS256', 'PS384', 'PS512');
}

var verify$1 = function (jwtString, secretOrPublicKey, options, callback) {
  if ((typeof options === 'function') && !callback) {
    callback = options;
    options = {};
  }

  if (!options) {
    options = {};
  }

  //clone this object since we are going to mutate it.
  options = Object.assign({}, options);

  var done;

  if (callback) {
    done = callback;
  } else {
    done = function(err, data) {
      if (err) throw err;
      return data;
    };
  }

  if (options.clockTimestamp && typeof options.clockTimestamp !== 'number') {
    return done(new JsonWebTokenError_1('clockTimestamp must be a number'));
  }

  if (options.nonce !== undefined && (typeof options.nonce !== 'string' || options.nonce.trim() === '')) {
    return done(new JsonWebTokenError_1('nonce must be a non-empty string'));
  }

  var clockTimestamp = options.clockTimestamp || Math.floor(Date.now() / 1000);

  if (!jwtString){
    return done(new JsonWebTokenError_1('jwt must be provided'));
  }

  if (typeof jwtString !== 'string') {
    return done(new JsonWebTokenError_1('jwt must be a string'));
  }

  var parts = jwtString.split('.');

  if (parts.length !== 3){
    return done(new JsonWebTokenError_1('jwt malformed'));
  }

  var decodedToken;

  try {
    decodedToken = decode$2(jwtString, { complete: true });
  } catch(err) {
    return done(err);
  }

  if (!decodedToken) {
    return done(new JsonWebTokenError_1('invalid token'));
  }

  var header = decodedToken.header;
  var getSecret;

  if(typeof secretOrPublicKey === 'function') {
    if(!callback) {
      return done(new JsonWebTokenError_1('verify must be called asynchronous if secret or public key is provided as a callback'));
    }

    getSecret = secretOrPublicKey;
  }
  else {
    getSecret = function(header, secretCallback) {
      return secretCallback(null, secretOrPublicKey);
    };
  }

  return getSecret(header, function(err, secretOrPublicKey) {
    if(err) {
      return done(new JsonWebTokenError_1('error in secret or public key callback: ' + err.message));
    }

    var hasSignature = parts[2].trim() !== '';

    if (!hasSignature && secretOrPublicKey){
      return done(new JsonWebTokenError_1('jwt signature is required'));
    }

    if (hasSignature && !secretOrPublicKey) {
      return done(new JsonWebTokenError_1('secret or public key must be provided'));
    }

    if (!hasSignature && !options.algorithms) {
      options.algorithms = ['none'];
    }

    if (!options.algorithms) {
      options.algorithms = ~secretOrPublicKey.toString().indexOf('BEGIN CERTIFICATE') ||
        ~secretOrPublicKey.toString().indexOf('BEGIN PUBLIC KEY') ? PUB_KEY_ALGS :
        ~secretOrPublicKey.toString().indexOf('BEGIN RSA PUBLIC KEY') ? RSA_KEY_ALGS : HS_ALGS;

    }

    if (!~options.algorithms.indexOf(decodedToken.header.alg)) {
      return done(new JsonWebTokenError_1('invalid algorithm'));
    }

    var valid;

    try {
      valid = jws.verify(jwtString, decodedToken.header.alg, secretOrPublicKey);
    } catch (e) {
      return done(e);
    }

    if (!valid) {
      return done(new JsonWebTokenError_1('invalid signature'));
    }

    var payload = decodedToken.payload;

    if (typeof payload.nbf !== 'undefined' && !options.ignoreNotBefore) {
      if (typeof payload.nbf !== 'number') {
        return done(new JsonWebTokenError_1('invalid nbf value'));
      }
      if (payload.nbf > clockTimestamp + (options.clockTolerance || 0)) {
        return done(new NotBeforeError_1('jwt not active', new Date(payload.nbf * 1000)));
      }
    }

    if (typeof payload.exp !== 'undefined' && !options.ignoreExpiration) {
      if (typeof payload.exp !== 'number') {
        return done(new JsonWebTokenError_1('invalid exp value'));
      }
      if (clockTimestamp >= payload.exp + (options.clockTolerance || 0)) {
        return done(new TokenExpiredError_1('jwt expired', new Date(payload.exp * 1000)));
      }
    }

    if (options.audience) {
      var audiences = Array.isArray(options.audience) ? options.audience : [options.audience];
      var target = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

      var match = target.some(function (targetAudience) {
        return audiences.some(function (audience) {
          return audience instanceof RegExp ? audience.test(targetAudience) : audience === targetAudience;
        });
      });

      if (!match) {
        return done(new JsonWebTokenError_1('jwt audience invalid. expected: ' + audiences.join(' or ')));
      }
    }

    if (options.issuer) {
      var invalid_issuer =
              (typeof options.issuer === 'string' && payload.iss !== options.issuer) ||
              (Array.isArray(options.issuer) && options.issuer.indexOf(payload.iss) === -1);

      if (invalid_issuer) {
        return done(new JsonWebTokenError_1('jwt issuer invalid. expected: ' + options.issuer));
      }
    }

    if (options.subject) {
      if (payload.sub !== options.subject) {
        return done(new JsonWebTokenError_1('jwt subject invalid. expected: ' + options.subject));
      }
    }

    if (options.jwtid) {
      if (payload.jti !== options.jwtid) {
        return done(new JsonWebTokenError_1('jwt jwtid invalid. expected: ' + options.jwtid));
      }
    }

    if (options.nonce) {
      if (payload.nonce !== options.nonce) {
        return done(new JsonWebTokenError_1('jwt nonce invalid. expected: ' + options.nonce));
      }
    }

    if (options.maxAge) {
      if (typeof payload.iat !== 'number') {
        return done(new JsonWebTokenError_1('iat required when maxAge is specified'));
      }

      var maxAgeTimestamp = timespan(options.maxAge, payload.iat);
      if (typeof maxAgeTimestamp === 'undefined') {
        return done(new JsonWebTokenError_1('"maxAge" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
      }
      if (clockTimestamp >= maxAgeTimestamp + (options.clockTolerance || 0)) {
        return done(new TokenExpiredError_1('maxAge exceeded', new Date(maxAgeTimestamp * 1000)));
      }
    }

    if (options.complete === true) {
      var signature = decodedToken.signature;

      return done(null, {
        header: header,
        payload: payload,
        signature: signature
      });
    }

    return done(null, payload);
  });
};

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0,
    MAX_SAFE_INTEGER = 9007199254740991,
    MAX_INTEGER = 1.7976931348623157e+308,
    NAN = 0 / 0;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    stringTag = '[object String]',
    symbolTag = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/**
 * A specialized version of `_.map` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array ? array.length : 0,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for iteratee shorthands.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} predicate The function invoked per iteration.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 1 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    return baseFindIndex(array, baseIsNaN, fromIndex);
  }
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.isNaN` without support for number objects.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
 */
function baseIsNaN(value) {
  return value !== value;
}

/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */
function baseTimes(n, iteratee) {
  var index = -1,
      result = Array(n);

  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

/**
 * The base implementation of `_.values` and `_.valuesIn` which creates an
 * array of `object` property values corresponding to the property names
 * of `props`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} props The property names to get values for.
 * @returns {Object} Returns the array of property values.
 */
function baseValues(object, props) {
  return arrayMap(props, function(key) {
    return object[key];
  });
}

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeKeys = overArg(Object.keys, Object),
    nativeMax = Math.max;

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys(value, inherited) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  // Safari 9 makes `arguments.length` enumerable in strict mode.
  var result = (isArray(value) || isArguments(value))
    ? baseTimes(value.length, String)
    : [];

  var length = result.length,
      skipIndexes = !!length;

  for (var key in value) {
    if ((inherited || hasOwnProperty.call(value, key)) &&
        !(skipIndexes && (key == 'length' || isIndex(key, length)))) {
      result.push(key);
    }
  }
  return result;
}

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype(value) {
  var Ctor = value && value.constructor,
      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

  return value === proto;
}

/**
 * Checks if `value` is in `collection`. If `collection` is a string, it's
 * checked for a substring of `value`, otherwise
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * is used for equality comparisons. If `fromIndex` is negative, it's used as
 * the offset from the end of `collection`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Collection
 * @param {Array|Object|string} collection The collection to inspect.
 * @param {*} value The value to search for.
 * @param {number} [fromIndex=0] The index to search from.
 * @param- {Object} [guard] Enables use as an iteratee for methods like `_.reduce`.
 * @returns {boolean} Returns `true` if `value` is found, else `false`.
 * @example
 *
 * _.includes([1, 2, 3], 1);
 * // => true
 *
 * _.includes([1, 2, 3], 1, 2);
 * // => false
 *
 * _.includes({ 'a': 1, 'b': 2 }, 1);
 * // => true
 *
 * _.includes('abcd', 'bc');
 * // => true
 */
function includes(collection, value, fromIndex, guard) {
  collection = isArrayLike(collection) ? collection : values(collection);
  fromIndex = (fromIndex && !guard) ? toInteger(fromIndex) : 0;

  var length = collection.length;
  if (fromIndex < 0) {
    fromIndex = nativeMax(length + fromIndex, 0);
  }
  return isString(collection)
    ? (fromIndex <= length && collection.indexOf(value, fromIndex) > -1)
    : (!!length && baseIndexOf(collection, value, fromIndex) > -1);
}

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/**
 * This method is like `_.isArrayLike` except that it also checks if `value`
 * is an object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array-like object,
 *  else `false`.
 * @example
 *
 * _.isArrayLikeObject([1, 2, 3]);
 * // => true
 *
 * _.isArrayLikeObject(document.body.children);
 * // => true
 *
 * _.isArrayLikeObject('abc');
 * // => false
 *
 * _.isArrayLikeObject(_.noop);
 * // => false
 */
function isArrayLikeObject(value) {
  return isObjectLike(value) && isArrayLike(value);
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject$1(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject$1(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `String` primitive or object.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a string, else `false`.
 * @example
 *
 * _.isString('abc');
 * // => true
 *
 * _.isString(1);
 * // => false
 */
function isString(value) {
  return typeof value == 'string' ||
    (!isArray(value) && isObjectLike(value) && objectToString.call(value) == stringTag);
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a finite number.
 *
 * @static
 * @memberOf _
 * @since 4.12.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted number.
 * @example
 *
 * _.toFinite(3.2);
 * // => 3.2
 *
 * _.toFinite(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toFinite(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toFinite('3.2');
 * // => 3.2
 */
function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    var sign = (value < 0 ? -1 : 1);
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

/**
 * Converts `value` to an integer.
 *
 * **Note:** This method is loosely based on
 * [`ToInteger`](http://www.ecma-international.org/ecma-262/7.0/#sec-tointeger).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted integer.
 * @example
 *
 * _.toInteger(3.2);
 * // => 3
 *
 * _.toInteger(Number.MIN_VALUE);
 * // => 0
 *
 * _.toInteger(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toInteger('3.2');
 * // => 3
 */
function toInteger(value) {
  var result = toFinite(value),
      remainder = result % 1;

  return result === result ? (remainder ? result - remainder : result) : 0;
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject$1(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject$1(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

/**
 * Creates an array of the own enumerable string keyed property values of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property values.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.values(new Foo);
 * // => [1, 2] (iteration order is not guaranteed)
 *
 * _.values('hi');
 * // => ['h', 'i']
 */
function values(object) {
  return object ? baseValues(object, keys(object)) : [];
}

var lodash_includes = includes;

/**
 * lodash 3.0.3 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var boolTag = '[object Boolean]';

/** Used for built-in method references. */
var objectProto$1 = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString$1 = objectProto$1.toString;

/**
 * Checks if `value` is classified as a boolean primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isBoolean(false);
 * // => true
 *
 * _.isBoolean(null);
 * // => false
 */
function isBoolean(value) {
  return value === true || value === false ||
    (isObjectLike$1(value) && objectToString$1.call(value) == boolTag);
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike$1(value) {
  return !!value && typeof value == 'object';
}

var lodash_isboolean = isBoolean;

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as references for various `Number` constants. */
var INFINITY$1 = 1 / 0,
    MAX_INTEGER$1 = 1.7976931348623157e+308,
    NAN$1 = 0 / 0;

/** `Object#toString` result references. */
var symbolTag$1 = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim$1 = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex$1 = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary$1 = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal$1 = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt$1 = parseInt;

/** Used for built-in method references. */
var objectProto$2 = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString$2 = objectProto$2.toString;

/**
 * Checks if `value` is an integer.
 *
 * **Note:** This method is based on
 * [`Number.isInteger`](https://mdn.io/Number/isInteger).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an integer, else `false`.
 * @example
 *
 * _.isInteger(3);
 * // => true
 *
 * _.isInteger(Number.MIN_VALUE);
 * // => false
 *
 * _.isInteger(Infinity);
 * // => false
 *
 * _.isInteger('3');
 * // => false
 */
function isInteger(value) {
  return typeof value == 'number' && value == toInteger$1(value);
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject$2(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike$2(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol$1(value) {
  return typeof value == 'symbol' ||
    (isObjectLike$2(value) && objectToString$2.call(value) == symbolTag$1);
}

/**
 * Converts `value` to a finite number.
 *
 * @static
 * @memberOf _
 * @since 4.12.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted number.
 * @example
 *
 * _.toFinite(3.2);
 * // => 3.2
 *
 * _.toFinite(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toFinite(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toFinite('3.2');
 * // => 3.2
 */
function toFinite$1(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber$1(value);
  if (value === INFINITY$1 || value === -INFINITY$1) {
    var sign = (value < 0 ? -1 : 1);
    return sign * MAX_INTEGER$1;
  }
  return value === value ? value : 0;
}

/**
 * Converts `value` to an integer.
 *
 * **Note:** This method is loosely based on
 * [`ToInteger`](http://www.ecma-international.org/ecma-262/7.0/#sec-tointeger).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted integer.
 * @example
 *
 * _.toInteger(3.2);
 * // => 3
 *
 * _.toInteger(Number.MIN_VALUE);
 * // => 0
 *
 * _.toInteger(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toInteger('3.2');
 * // => 3
 */
function toInteger$1(value) {
  var result = toFinite$1(value),
      remainder = result % 1;

  return result === result ? (remainder ? result - remainder : result) : 0;
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber$1(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol$1(value)) {
    return NAN$1;
  }
  if (isObject$2(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject$2(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim$1, '');
  var isBinary = reIsBinary$1.test(value);
  return (isBinary || reIsOctal$1.test(value))
    ? freeParseInt$1(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex$1.test(value) ? NAN$1 : +value);
}

var lodash_isinteger = isInteger;

/**
 * lodash 3.0.3 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var numberTag = '[object Number]';

/** Used for built-in method references. */
var objectProto$3 = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString$3 = objectProto$3.toString;

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike$3(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Number` primitive or object.
 *
 * **Note:** To exclude `Infinity`, `-Infinity`, and `NaN`, which are classified
 * as numbers, use the `_.isFinite` method.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isNumber(3);
 * // => true
 *
 * _.isNumber(Number.MIN_VALUE);
 * // => true
 *
 * _.isNumber(Infinity);
 * // => true
 *
 * _.isNumber('3');
 * // => false
 */
function isNumber(value) {
  return typeof value == 'number' ||
    (isObjectLike$3(value) && objectToString$3.call(value) == numberTag);
}

var lodash_isnumber = isNumber;

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** `Object#toString` result references. */
var objectTag = '[object Object]';

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg$1(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

/** Used for built-in method references. */
var funcProto = Function.prototype,
    objectProto$4 = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty$1 = objectProto$4.hasOwnProperty;

/** Used to infer the `Object` constructor. */
var objectCtorString = funcToString.call(Object);

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString$4 = objectProto$4.toString;

/** Built-in value references. */
var getPrototype = overArg$1(Object.getPrototypeOf, Object);

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike$4(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is a plain object, that is, an object created by the
 * `Object` constructor or one with a `[[Prototype]]` of `null`.
 *
 * @static
 * @memberOf _
 * @since 0.8.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 * }
 *
 * _.isPlainObject(new Foo);
 * // => false
 *
 * _.isPlainObject([1, 2, 3]);
 * // => false
 *
 * _.isPlainObject({ 'x': 0, 'y': 0 });
 * // => true
 *
 * _.isPlainObject(Object.create(null));
 * // => true
 */
function isPlainObject(value) {
  if (!isObjectLike$4(value) ||
      objectToString$4.call(value) != objectTag || isHostObject(value)) {
    return false;
  }
  var proto = getPrototype(value);
  if (proto === null) {
    return true;
  }
  var Ctor = hasOwnProperty$1.call(proto, 'constructor') && proto.constructor;
  return (typeof Ctor == 'function' &&
    Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString);
}

var lodash_isplainobject = isPlainObject;

/**
 * lodash 4.0.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var stringTag$1 = '[object String]';

/** Used for built-in method references. */
var objectProto$5 = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString$5 = objectProto$5.toString;

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray$1 = Array.isArray;

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike$5(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `String` primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isString('abc');
 * // => true
 *
 * _.isString(1);
 * // => false
 */
function isString$1(value) {
  return typeof value == 'string' ||
    (!isArray$1(value) && isObjectLike$5(value) && objectToString$5.call(value) == stringTag$1);
}

var lodash_isstring = isString$1;

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as references for various `Number` constants. */
var INFINITY$2 = 1 / 0,
    MAX_INTEGER$2 = 1.7976931348623157e+308,
    NAN$2 = 0 / 0;

/** `Object#toString` result references. */
var symbolTag$2 = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim$2 = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex$2 = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary$2 = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal$2 = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt$2 = parseInt;

/** Used for built-in method references. */
var objectProto$6 = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString$6 = objectProto$6.toString;

/**
 * Creates a function that invokes `func`, with the `this` binding and arguments
 * of the created function, while it's called less than `n` times. Subsequent
 * calls to the created function return the result of the last `func` invocation.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Function
 * @param {number} n The number of calls at which `func` is no longer invoked.
 * @param {Function} func The function to restrict.
 * @returns {Function} Returns the new restricted function.
 * @example
 *
 * jQuery(element).on('click', _.before(5, addContactToList));
 * // => Allows adding up to 4 contacts to the list.
 */
function before(n, func) {
  var result;
  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  n = toInteger$2(n);
  return function() {
    if (--n > 0) {
      result = func.apply(this, arguments);
    }
    if (n <= 1) {
      func = undefined;
    }
    return result;
  };
}

/**
 * Creates a function that is restricted to invoking `func` once. Repeat calls
 * to the function return the value of the first invocation. The `func` is
 * invoked with the `this` binding and arguments of the created function.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to restrict.
 * @returns {Function} Returns the new restricted function.
 * @example
 *
 * var initialize = _.once(createApplication);
 * initialize();
 * initialize();
 * // => `createApplication` is invoked once
 */
function once(func) {
  return before(2, func);
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject$3(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike$6(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol$2(value) {
  return typeof value == 'symbol' ||
    (isObjectLike$6(value) && objectToString$6.call(value) == symbolTag$2);
}

/**
 * Converts `value` to a finite number.
 *
 * @static
 * @memberOf _
 * @since 4.12.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted number.
 * @example
 *
 * _.toFinite(3.2);
 * // => 3.2
 *
 * _.toFinite(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toFinite(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toFinite('3.2');
 * // => 3.2
 */
function toFinite$2(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber$2(value);
  if (value === INFINITY$2 || value === -INFINITY$2) {
    var sign = (value < 0 ? -1 : 1);
    return sign * MAX_INTEGER$2;
  }
  return value === value ? value : 0;
}

/**
 * Converts `value` to an integer.
 *
 * **Note:** This method is loosely based on
 * [`ToInteger`](http://www.ecma-international.org/ecma-262/7.0/#sec-tointeger).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted integer.
 * @example
 *
 * _.toInteger(3.2);
 * // => 3
 *
 * _.toInteger(Number.MIN_VALUE);
 * // => 0
 *
 * _.toInteger(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toInteger('3.2');
 * // => 3
 */
function toInteger$2(value) {
  var result = toFinite$2(value),
      remainder = result % 1;

  return result === result ? (remainder ? result - remainder : result) : 0;
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber$2(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol$2(value)) {
    return NAN$2;
  }
  if (isObject$3(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject$3(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim$2, '');
  var isBinary = reIsBinary$2.test(value);
  return (isBinary || reIsOctal$2.test(value))
    ? freeParseInt$2(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex$2.test(value) ? NAN$2 : +value);
}

var lodash_once = once;

var SUPPORTED_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'HS256', 'HS384', 'HS512', 'none'];
if (psSupported) {
  SUPPORTED_ALGS.splice(3, 0, 'PS256', 'PS384', 'PS512');
}

var sign_options_schema = {
  expiresIn: { isValid: function(value) { return lodash_isinteger(value) || (lodash_isstring(value) && value); }, message: '"expiresIn" should be a number of seconds or string representing a timespan' },
  notBefore: { isValid: function(value) { return lodash_isinteger(value) || (lodash_isstring(value) && value); }, message: '"notBefore" should be a number of seconds or string representing a timespan' },
  audience: { isValid: function(value) { return lodash_isstring(value) || Array.isArray(value); }, message: '"audience" must be a string or array' },
  algorithm: { isValid: lodash_includes.bind(null, SUPPORTED_ALGS), message: '"algorithm" must be a valid string enum value' },
  header: { isValid: lodash_isplainobject, message: '"header" must be an object' },
  encoding: { isValid: lodash_isstring, message: '"encoding" must be a string' },
  issuer: { isValid: lodash_isstring, message: '"issuer" must be a string' },
  subject: { isValid: lodash_isstring, message: '"subject" must be a string' },
  jwtid: { isValid: lodash_isstring, message: '"jwtid" must be a string' },
  noTimestamp: { isValid: lodash_isboolean, message: '"noTimestamp" must be a boolean' },
  keyid: { isValid: lodash_isstring, message: '"keyid" must be a string' },
  mutatePayload: { isValid: lodash_isboolean, message: '"mutatePayload" must be a boolean' }
};

var registered_claims_schema = {
  iat: { isValid: lodash_isnumber, message: '"iat" should be a number of seconds' },
  exp: { isValid: lodash_isnumber, message: '"exp" should be a number of seconds' },
  nbf: { isValid: lodash_isnumber, message: '"nbf" should be a number of seconds' }
};

function validate(schema, allowUnknown, object, parameterName) {
  if (!lodash_isplainobject(object)) {
    throw new Error('Expected "' + parameterName + '" to be a plain object.');
  }
  Object.keys(object)
    .forEach(function(key) {
      var validator = schema[key];
      if (!validator) {
        if (!allowUnknown) {
          throw new Error('"' + key + '" is not allowed in "' + parameterName + '"');
        }
        return;
      }
      if (!validator.isValid(object[key])) {
        throw new Error(validator.message);
      }
    });
}

function validateOptions(options) {
  return validate(sign_options_schema, false, options, 'options');
}

function validatePayload(payload) {
  return validate(registered_claims_schema, true, payload, 'payload');
}

var options_to_payload = {
  'audience': 'aud',
  'issuer': 'iss',
  'subject': 'sub',
  'jwtid': 'jti'
};

var options_for_objects = [
  'expiresIn',
  'notBefore',
  'noTimestamp',
  'audience',
  'issuer',
  'subject',
  'jwtid',
];

var sign$1 = function (payload, secretOrPrivateKey, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }

  var isObjectPayload = typeof payload === 'object' &&
                        !Buffer.isBuffer(payload);

  var header = Object.assign({
    alg: options.algorithm || 'HS256',
    typ: isObjectPayload ? 'JWT' : undefined,
    kid: options.keyid
  }, options.header);

  function failure(err) {
    if (callback) {
      return callback(err);
    }
    throw err;
  }

  if (!secretOrPrivateKey && options.algorithm !== 'none') {
    return failure(new Error('secretOrPrivateKey must have a value'));
  }

  if (typeof payload === 'undefined') {
    return failure(new Error('payload is required'));
  } else if (isObjectPayload) {
    try {
      validatePayload(payload);
    }
    catch (error) {
      return failure(error);
    }
    if (!options.mutatePayload) {
      payload = Object.assign({},payload);
    }
  } else {
    var invalid_options = options_for_objects.filter(function (opt) {
      return typeof options[opt] !== 'undefined';
    });

    if (invalid_options.length > 0) {
      return failure(new Error('invalid ' + invalid_options.join(',') + ' option for ' + (typeof payload ) + ' payload'));
    }
  }

  if (typeof payload.exp !== 'undefined' && typeof options.expiresIn !== 'undefined') {
    return failure(new Error('Bad "options.expiresIn" option the payload already has an "exp" property.'));
  }

  if (typeof payload.nbf !== 'undefined' && typeof options.notBefore !== 'undefined') {
    return failure(new Error('Bad "options.notBefore" option the payload already has an "nbf" property.'));
  }

  try {
    validateOptions(options);
  }
  catch (error) {
    return failure(error);
  }

  var timestamp = payload.iat || Math.floor(Date.now() / 1000);

  if (options.noTimestamp) {
    delete payload.iat;
  } else if (isObjectPayload) {
    payload.iat = timestamp;
  }

  if (typeof options.notBefore !== 'undefined') {
    try {
      payload.nbf = timespan(options.notBefore, timestamp);
    }
    catch (err) {
      return failure(err);
    }
    if (typeof payload.nbf === 'undefined') {
      return failure(new Error('"notBefore" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
    }
  }

  if (typeof options.expiresIn !== 'undefined' && typeof payload === 'object') {
    try {
      payload.exp = timespan(options.expiresIn, timestamp);
    }
    catch (err) {
      return failure(err);
    }
    if (typeof payload.exp === 'undefined') {
      return failure(new Error('"expiresIn" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
    }
  }

  Object.keys(options_to_payload).forEach(function (key) {
    var claim = options_to_payload[key];
    if (typeof options[key] !== 'undefined') {
      if (typeof payload[claim] !== 'undefined') {
        return failure(new Error('Bad "options.' + key + '" option. The payload already has an "' + claim + '" property.'));
      }
      payload[claim] = options[key];
    }
  });

  var encoding = options.encoding || 'utf8';

  if (typeof callback === 'function') {
    callback = callback && lodash_once(callback);

    jws.createSign({
      header: header,
      privateKey: secretOrPrivateKey,
      payload: payload,
      encoding: encoding
    }).once('error', callback)
      .once('done', function (signature) {
        callback(null, signature);
      });
  } else {
    return jws.sign({header: header, payload: payload, secret: secretOrPrivateKey, encoding: encoding});
  }
};

var jsonwebtoken = {
  decode: decode$2,
  verify: verify$1,
  sign: sign$1,
  JsonWebTokenError: JsonWebTokenError_1,
  NotBeforeError: NotBeforeError_1,
  TokenExpiredError: TokenExpiredError_1,
};

/**
 * Tokenize input string.
 */
function lexer(str) {
    var tokens = [];
    var i = 0;
    while (i < str.length) {
        var char = str[i];
        if (char === "*" || char === "+" || char === "?") {
            tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
            continue;
        }
        if (char === "\\") {
            tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
            continue;
        }
        if (char === "{") {
            tokens.push({ type: "OPEN", index: i, value: str[i++] });
            continue;
        }
        if (char === "}") {
            tokens.push({ type: "CLOSE", index: i, value: str[i++] });
            continue;
        }
        if (char === ":") {
            var name = "";
            var j = i + 1;
            while (j < str.length) {
                var code = str.charCodeAt(j);
                if (
                // `0-9`
                (code >= 48 && code <= 57) ||
                    // `A-Z`
                    (code >= 65 && code <= 90) ||
                    // `a-z`
                    (code >= 97 && code <= 122) ||
                    // `_`
                    code === 95) {
                    name += str[j++];
                    continue;
                }
                break;
            }
            if (!name)
                throw new TypeError("Missing parameter name at " + i);
            tokens.push({ type: "NAME", index: i, value: name });
            i = j;
            continue;
        }
        if (char === "(") {
            var count = 1;
            var pattern = "";
            var j = i + 1;
            if (str[j] === "?") {
                throw new TypeError("Pattern cannot start with \"?\" at " + j);
            }
            while (j < str.length) {
                if (str[j] === "\\") {
                    pattern += str[j++] + str[j++];
                    continue;
                }
                if (str[j] === ")") {
                    count--;
                    if (count === 0) {
                        j++;
                        break;
                    }
                }
                else if (str[j] === "(") {
                    count++;
                    if (str[j + 1] !== "?") {
                        throw new TypeError("Capturing groups are not allowed at " + j);
                    }
                }
                pattern += str[j++];
            }
            if (count)
                throw new TypeError("Unbalanced pattern at " + i);
            if (!pattern)
                throw new TypeError("Missing pattern at " + i);
            tokens.push({ type: "PATTERN", index: i, value: pattern });
            i = j;
            continue;
        }
        tokens.push({ type: "CHAR", index: i, value: str[i++] });
    }
    tokens.push({ type: "END", index: i, value: "" });
    return tokens;
}
/**
 * Parse a string for the raw tokens.
 */
function parse$2(str, options) {
    if (options === void 0) { options = {}; }
    var tokens = lexer(str);
    var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a;
    var defaultPattern = "[^" + escapeString(options.delimiter || "/#?") + "]+?";
    var result = [];
    var key = 0;
    var i = 0;
    var path = "";
    var tryConsume = function (type) {
        if (i < tokens.length && tokens[i].type === type)
            return tokens[i++].value;
    };
    var mustConsume = function (type) {
        var value = tryConsume(type);
        if (value !== undefined)
            return value;
        var _a = tokens[i], nextType = _a.type, index = _a.index;
        throw new TypeError("Unexpected " + nextType + " at " + index + ", expected " + type);
    };
    var consumeText = function () {
        var result = "";
        var value;
        // tslint:disable-next-line
        while ((value = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR"))) {
            result += value;
        }
        return result;
    };
    while (i < tokens.length) {
        var char = tryConsume("CHAR");
        var name = tryConsume("NAME");
        var pattern = tryConsume("PATTERN");
        if (name || pattern) {
            var prefix = char || "";
            if (prefixes.indexOf(prefix) === -1) {
                path += prefix;
                prefix = "";
            }
            if (path) {
                result.push(path);
                path = "";
            }
            result.push({
                name: name || key++,
                prefix: prefix,
                suffix: "",
                pattern: pattern || defaultPattern,
                modifier: tryConsume("MODIFIER") || ""
            });
            continue;
        }
        var value = char || tryConsume("ESCAPED_CHAR");
        if (value) {
            path += value;
            continue;
        }
        if (path) {
            result.push(path);
            path = "";
        }
        var open = tryConsume("OPEN");
        if (open) {
            var prefix = consumeText();
            var name_1 = tryConsume("NAME") || "";
            var pattern_1 = tryConsume("PATTERN") || "";
            var suffix = consumeText();
            mustConsume("CLOSE");
            result.push({
                name: name_1 || (pattern_1 ? key++ : ""),
                pattern: name_1 && !pattern_1 ? defaultPattern : pattern_1,
                prefix: prefix,
                suffix: suffix,
                modifier: tryConsume("MODIFIER") || ""
            });
            continue;
        }
        mustConsume("END");
    }
    return result;
}
/**
 * Compile a string to a template function for the path.
 */
function compile(str, options) {
    return tokensToFunction(parse$2(str, options), options);
}
/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction(tokens, options) {
    if (options === void 0) { options = {}; }
    var reFlags = flags(options);
    var _a = options.encode, encode = _a === void 0 ? function (x) { return x; } : _a, _b = options.validate, validate = _b === void 0 ? true : _b;
    // Compile all the tokens into regexps.
    var matches = tokens.map(function (token) {
        if (typeof token === "object") {
            return new RegExp("^(?:" + token.pattern + ")$", reFlags);
        }
    });
    return function (data) {
        var path = "";
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            if (typeof token === "string") {
                path += token;
                continue;
            }
            var value = data ? data[token.name] : undefined;
            var optional = token.modifier === "?" || token.modifier === "*";
            var repeat = token.modifier === "*" || token.modifier === "+";
            if (Array.isArray(value)) {
                if (!repeat) {
                    throw new TypeError("Expected \"" + token.name + "\" to not repeat, but got an array");
                }
                if (value.length === 0) {
                    if (optional)
                        continue;
                    throw new TypeError("Expected \"" + token.name + "\" to not be empty");
                }
                for (var j = 0; j < value.length; j++) {
                    var segment = encode(value[j], token);
                    if (validate && !matches[i].test(segment)) {
                        throw new TypeError("Expected all \"" + token.name + "\" to match \"" + token.pattern + "\", but got \"" + segment + "\"");
                    }
                    path += token.prefix + segment + token.suffix;
                }
                continue;
            }
            if (typeof value === "string" || typeof value === "number") {
                var segment = encode(String(value), token);
                if (validate && !matches[i].test(segment)) {
                    throw new TypeError("Expected \"" + token.name + "\" to match \"" + token.pattern + "\", but got \"" + segment + "\"");
                }
                path += token.prefix + segment + token.suffix;
                continue;
            }
            if (optional)
                continue;
            var typeOfMessage = repeat ? "an array" : "a string";
            throw new TypeError("Expected \"" + token.name + "\" to be " + typeOfMessage);
        }
        return path;
    };
}
/**
 * Create path match function from `path-to-regexp` spec.
 */
function match(str, options) {
    var keys = [];
    var re = pathToRegexp(str, keys, options);
    return regexpToFunction(re, keys, options);
}
/**
 * Create a path match function from `path-to-regexp` output.
 */
function regexpToFunction(re, keys, options) {
    if (options === void 0) { options = {}; }
    var _a = options.decode, decode = _a === void 0 ? function (x) { return x; } : _a;
    return function (pathname) {
        var m = re.exec(pathname);
        if (!m)
            return false;
        var path = m[0], index = m.index;
        var params = Object.create(null);
        var _loop_1 = function (i) {
            // tslint:disable-next-line
            if (m[i] === undefined)
                return "continue";
            var key = keys[i - 1];
            if (key.modifier === "*" || key.modifier === "+") {
                params[key.name] = m[i].split(key.prefix + key.suffix).map(function (value) {
                    return decode(value, key);
                });
            }
            else {
                params[key.name] = decode(m[i], key);
            }
        };
        for (var i = 1; i < m.length; i++) {
            _loop_1(i);
        }
        return { path: path, index: index, params: params };
    };
}
/**
 * Escape a regular expression string.
 */
function escapeString(str) {
    return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
/**
 * Get the flags for a regexp from the options.
 */
function flags(options) {
    return options && options.sensitive ? "" : "i";
}
/**
 * Pull out keys from a regexp.
 */
function regexpToRegexp(path, keys) {
    if (!keys)
        return path;
    // Use a negative lookahead to match only capturing groups.
    var groups = path.source.match(/\((?!\?)/g);
    if (groups) {
        for (var i = 0; i < groups.length; i++) {
            keys.push({
                name: i,
                prefix: "",
                suffix: "",
                modifier: "",
                pattern: ""
            });
        }
    }
    return path;
}
/**
 * Transform an array into a regexp.
 */
function arrayToRegexp(paths, keys, options) {
    var parts = paths.map(function (path) { return pathToRegexp(path, keys, options).source; });
    return new RegExp("(?:" + parts.join("|") + ")", flags(options));
}
/**
 * Create a path regexp from string input.
 */
function stringToRegexp(path, keys, options) {
    return tokensToRegexp(parse$2(path, options), keys, options);
}
/**
 * Expose a function for taking tokens and returning a RegExp.
 */
function tokensToRegexp(tokens, keys, options) {
    if (options === void 0) { options = {}; }
    var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function (x) { return x; } : _d;
    var endsWith = "[" + escapeString(options.endsWith || "") + "]|$";
    var delimiter = "[" + escapeString(options.delimiter || "/#?") + "]";
    var route = start ? "^" : "";
    // Iterate over the tokens and create our regexp string.
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var token = tokens_1[_i];
        if (typeof token === "string") {
            route += escapeString(encode(token));
        }
        else {
            var prefix = escapeString(encode(token.prefix));
            var suffix = escapeString(encode(token.suffix));
            if (token.pattern) {
                if (keys)
                    keys.push(token);
                if (prefix || suffix) {
                    if (token.modifier === "+" || token.modifier === "*") {
                        var mod = token.modifier === "*" ? "?" : "";
                        route += "(?:" + prefix + "((?:" + token.pattern + ")(?:" + suffix + prefix + "(?:" + token.pattern + "))*)" + suffix + ")" + mod;
                    }
                    else {
                        route += "(?:" + prefix + "(" + token.pattern + ")" + suffix + ")" + token.modifier;
                    }
                }
                else {
                    route += "(" + token.pattern + ")" + token.modifier;
                }
            }
            else {
                route += "(?:" + prefix + suffix + ")" + token.modifier;
            }
        }
    }
    if (end) {
        if (!strict)
            route += delimiter + "?";
        route += !options.endsWith ? "$" : "(?=" + endsWith + ")";
    }
    else {
        var endToken = tokens[tokens.length - 1];
        var isEndDelimited = typeof endToken === "string"
            ? delimiter.indexOf(endToken[endToken.length - 1]) > -1
            : // tslint:disable-next-line
                endToken === undefined;
        if (!strict) {
            route += "(?:" + delimiter + "(?=" + endsWith + "))?";
        }
        if (!isEndDelimited) {
            route += "(?=" + delimiter + "|" + endsWith + ")";
        }
    }
    return new RegExp(route, flags(options));
}
/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 */
function pathToRegexp(path, keys, options) {
    if (path instanceof RegExp)
        return regexpToRegexp(path, keys);
    if (Array.isArray(path))
        return arrayToRegexp(path, keys, options);
    return stringToRegexp(path, keys, options);
}

/**
 Provides matching capabilities to support custom redirects, rewrites, and headers.
 */
/**
 * Match the given path against a source path.
 * @param path
 * @param source
 */
function matchPath(path, source) {
    const matcher = match(source, { decode: decodeURIComponent });
    return matcher(path);
}
/**
 * Compile a destination for redirects or rewrites.
 * @param destination
 * @param params
 */
function compileDestination(destination, params) {
    try {
        const destinationLowerCase = destination.toLowerCase();
        if (destinationLowerCase.startsWith("https://") ||
            destinationLowerCase.startsWith("http://")) {
            // Handle external URLs
            const { origin, pathname } = new URL(destination);
            const toPath = compile(pathname, { encode: encodeURIComponent });
            const compiledDestination = `${origin}${toPath(params)}`;
            // Remove trailing slash if original destination didn't have it
            if (!destination.endsWith("/") && compiledDestination.endsWith("/")) {
                return compiledDestination.slice(0, -1);
            }
            else {
                return compiledDestination;
            }
        }
        else {
            // Handle all other paths. Escape all ? in case of query parameters
            const escapedDestination = destination.replace(/\?/g, "\\?");
            const toPath = compile(escapedDestination, {
                encode: encodeURIComponent
            });
            return toPath(params);
        }
    }
    catch (error) {
        console.error(`Could not compile destination ${destination}, returning null instead. Error: ${error}`);
        return null;
    }
}

/**
 * Get the redirect of the given path, if it exists. Otherwise return null.
 * @param path
 * @param routesManifest
 */
function getRedirectPath(path, routesManifest) {
    const redirects = routesManifest.redirects;
    for (const redirect of redirects) {
        const match = matchPath(path, redirect.source);
        if (match) {
            const compiledDestination = compileDestination(redirect.destination, match.params);
            if (!compiledDestination) {
                return null;
            }
            return {
                redirectPath: compiledDestination,
                statusCode: redirect.statusCode
            };
        }
    }
    return null;
}
/**
 * Create a redirect response with the given status code for CloudFront.
 * @param uri
 * @param querystring
 * @param statusCode
 */
function createRedirectResponse(uri, querystring, statusCode) {
    const location = querystring ? `${uri}?${querystring}` : uri;
    const status = statusCode.toString();
    const statusDescription = http.STATUS_CODES[status];
    const refresh = statusCode === 308
        ? [
            // Required for IE11 compatibility
            {
                key: "Refresh",
                value: `0;url=${location}`
            }
        ]
        : [];
    return {
        status: status,
        statusDescription: statusDescription,
        headers: {
            location: [
                {
                    key: "Location",
                    value: location
                }
            ],
            refresh: refresh
        }
    };
}
/**
 * Get a domain redirect such as redirecting www to non-www domain.
 * @param request
 * @param buildManifest
 */
function getDomainRedirectPath(request, buildManifest) {
    const hostHeaders = request.headers["host"];
    if (hostHeaders && hostHeaders.length > 0) {
        const host = hostHeaders[0].value;
        const domainRedirects = buildManifest.domainRedirects;
        if (domainRedirects && domainRedirects[host]) {
            return `${domainRedirects[host]}${request.uri}`;
        }
    }
    return null;
}

/**
 * Get the rewrite of the given path, if it exists. Otherwise return null.
 * @param path
 * @param routesManifest
 */
function getRewritePath(path, routesManifest) {
    const rewrites = routesManifest.rewrites;
    for (const rewrite of rewrites) {
        const match = matchPath(path, rewrite.source);
        if (match) {
            return compileDestination(rewrite.destination, match.params);
        }
    }
    return null;
}

function addHeadersToResponse(path, response, routesManifest) {
    // Add custom headers to response
    if (response.headers) {
        for (const headerData of routesManifest.headers) {
            const match = matchPath(path, headerData.source);
            if (match) {
                for (const header of headerData.headers) {
                    if (header.key && header.value) {
                        const headerLowerCase = header.key.toLowerCase();
                        response.headers[headerLowerCase] = [
                            {
                                key: headerLowerCase,
                                value: header.value
                            }
                        ];
                    }
                }
            }
        }
    }
}

// @ts-ignore
const basePath = RoutesManifestJson__default['default'].basePath;
const NEXT_PREVIEW_DATA_COOKIE = "__next_preview_data";
const NEXT_PRERENDER_BYPASS_COOKIE = "__prerender_bypass";
const defaultPreviewCookies = {
    [NEXT_PRERENDER_BYPASS_COOKIE]: "",
    [NEXT_PREVIEW_DATA_COOKIE]: ""
};
const getPreviewCookies = (request) => {
    const targetCookie = request.headers.cookie || [];
    return targetCookie.reduce((previewCookies, cookieObj) => {
        const cookieValue = cookie.parse(cookieObj.value);
        if (cookieValue[NEXT_PREVIEW_DATA_COOKIE] &&
            cookieValue[NEXT_PRERENDER_BYPASS_COOKIE]) {
            return cookieValue;
        }
        else {
            return previewCookies;
        }
    }, defaultPreviewCookies);
};
const perfLogger = (logLambdaExecutionTimes) => {
    if (logLambdaExecutionTimes) {
        return {
            now: () => perf_hooks.performance.now(),
            log: (metricDescription, t1, t2) => {
                if (!t1 || !t2)
                    return;
                console.log(`${metricDescription}: ${t2 - t1} (ms)`);
            }
        };
    }
    return {
        now: () => 0,
        log: () => { }
    };
};
const addS3HostHeader = (req, s3DomainName) => {
    req.headers["host"] = [{ key: "host", value: s3DomainName }];
};
const isDataRequest = (uri) => uri.startsWith("/_next/data");
const normaliseUri = (uri) => {
    if (basePath) {
        if (uri.startsWith(basePath)) {
            uri = uri.slice(basePath.length);
        }
        else {
            // basePath set but URI does not start with basePath, return 404
            return "/404";
        }
    }
    // Remove trailing slash for all paths
    if (uri.endsWith("/")) {
        uri = uri.slice(0, -1);
    }
    // Empty path should be normalised to "/" as there is no Next.js route for ""
    return uri === "" ? "/" : uri;
};
const normaliseS3OriginDomain = (s3Origin) => {
    if (s3Origin.region === "us-east-1") {
        return s3Origin.domainName;
    }
    if (!s3Origin.domainName.includes(s3Origin.region)) {
        const regionalEndpoint = s3Origin.domainName.replace("s3.amazonaws.com", `s3.${s3Origin.region}.amazonaws.com`);
        return regionalEndpoint;
    }
    return s3Origin.domainName;
};
const normaliseDataRequestUri = (uri, manifest) => {
    let normalisedUri = uri
        .replace(`/_next/data/${manifest.buildId}`, "")
        .replace(".json", "");
    // Normalise to "/" for index data request
    normalisedUri = ["/index", ""].includes(normalisedUri) ? "/" : normalisedUri;
    return normalisedUri;
};
const router = (manifest) => {
    const { pages: { ssr, html } } = manifest;
    const allDynamicRoutes = { ...ssr.dynamic, ...html.dynamic };
    return (uri) => {
        let normalisedUri = uri;
        if (isDataRequest(uri)) {
            normalisedUri = normaliseDataRequestUri(normalisedUri, manifest);
        }
        if (ssr.nonDynamic[normalisedUri]) {
            return ssr.nonDynamic[normalisedUri];
        }
        for (const route in allDynamicRoutes) {
            const { file, regex } = allDynamicRoutes[route];
            const re = new RegExp(regex, "i");
            const pathMatchesRoute = re.test(normalisedUri);
            if (pathMatchesRoute) {
                return file;
            }
        }
        // only use the 404 page if the project exports it
        if (html.nonDynamic["/404"] !== undefined) {
            return "pages/404.html";
        }
        return "pages/_error.js";
    };
};
// Need retries to fix https://github.com/aws/aws-sdk-js-v3/issues/1196
const buildS3RetryStrategy = async () => {
    const { defaultRetryDecider, StandardRetryStrategy } = await Promise.resolve().then(function () { return index; });
    const retryDecider = (err) => {
        if ("code" in err &&
            (err.code === "ECONNRESET" ||
                err.code === "EPIPE" ||
                err.code === "ETIMEDOUT")) {
            return true;
        }
        else {
            return defaultRetryDecider(err);
        }
    };
    return new StandardRetryStrategy(async () => 3, {
        retryDecider
    });
};
const handler$1 = async (event) => {
    const manifest = Manifest__default['default'];
    let response;
    const prerenderManifest = PrerenderManifest__default['default'];
    const routesManifest = RoutesManifestJson__default['default'];
    const { now, log } = perfLogger(manifest.logLambdaExecutionTimes);
    const tHandlerBegin = now();
    if (isOriginResponse(event)) {
        response = await handleOriginResponse({
            event,
            manifest,
            prerenderManifest
        });
    }
    else {
        response = await handleOriginRequest({
            event,
            manifest,
            prerenderManifest,
            routesManifest
        });
    }
    // Add custom headers to responses only.
    // TODO: for paths that hit S3 origin, it will match on the rewritten URI, i.e it may be rewritten to S3 key.
    if (response.hasOwnProperty("status")) {
        const request = event.Records[0].cf.request;
        addHeadersToResponse(request.uri, response, routesManifest);
    }
    const tHandlerEnd = now();
    log("handler execution time", tHandlerBegin, tHandlerEnd);
    return response;
};
const handleOriginRequest = async ({ event, manifest, prerenderManifest, routesManifest }) => {
    const request = event.Records[0].cf.request;
    // Handle domain redirects e.g www to non-www domain
    const domainRedirect = getDomainRedirectPath(request, manifest);
    if (domainRedirect) {
        return createRedirectResponse(domainRedirect, request.querystring, 308);
    }
    const basePath = routesManifest.basePath;
    let uri = normaliseUri(request.uri);
    const { pages, publicFiles } = manifest;
    let isPublicFile = publicFiles[uri];
    let isDataReq = isDataRequest(uri);
    // Handle redirects
    // TODO: refactor redirect logic to another file since this is getting quite large
    // Handle any trailing slash redirects
    let newUri = request.uri;
    if (isDataReq || isPublicFile) {
        // Data requests and public files with trailing slash URL always get redirected to non-trailing slash URL
        if (newUri.endsWith("/")) {
            newUri = newUri.slice(0, -1);
        }
    }
    else if (request.uri !== "/" && request.uri !== "" && uri !== "/404") {
        // HTML/SSR pages get redirected based on trailingSlash in next.config.js
        // We do not redirect:
        // 1. Unnormalised URI is "/" or "" as this could cause a redirect loop due to browsers appending trailing slash
        // 2. "/404" pages due to basePath normalisation
        const trailingSlash = manifest.trailingSlash;
        if (!trailingSlash && newUri.endsWith("/")) {
            newUri = newUri.slice(0, -1);
        }
        if (trailingSlash && !newUri.endsWith("/")) {
            newUri += "/";
        }
    }
    if (newUri !== request.uri) {
        return createRedirectResponse(newUri, request.querystring, 308);
    }
    // Handle other custom redirects on the original URI
    const customRedirect = getRedirectPath(request.uri, routesManifest);
    if (customRedirect) {
        return createRedirectResponse(customRedirect.redirectPath, request.querystring, customRedirect.statusCode);
    }
    // Check for non-dynamic pages before rewriting
    let isNonDynamicRoute = pages.html.nonDynamic[uri] || pages.ssr.nonDynamic[uri] || isPublicFile;
    // Handle custom rewrites, but don't rewrite non-dynamic pages, public files or data requests per Next.js docs: https://nextjs.org/docs/api-reference/next.config.js/rewrites
    if (!isNonDynamicRoute && !isDataReq) {
        const customRewrite = getRewritePath(request.uri, routesManifest);
        if (customRewrite) {
            request.uri = customRewrite;
            uri = normaliseUri(request.uri);
        }
    }
    const isStaticPage = pages.html.nonDynamic[uri]; // plain page without any props
    const isPrerenderedPage = prerenderManifest.routes[uri]; // prerendered pages are also static pages like "pages.html" above, but are defined in the prerender-manifest
    const origin = request.origin;
    const s3Origin = origin.s3;
    const isHTMLPage = isStaticPage || isPrerenderedPage;
    const normalisedS3DomainName = normaliseS3OriginDomain(s3Origin);
    const hasFallback = hasFallbackForUri(uri, prerenderManifest, manifest);
    const { now, log } = perfLogger(manifest.logLambdaExecutionTimes);
    const previewCookies = getPreviewCookies(request);
    const isPreviewRequest = previewCookies[NEXT_PREVIEW_DATA_COOKIE] &&
        previewCookies[NEXT_PRERENDER_BYPASS_COOKIE];
    if (isPreviewRequest) {
        try {
            jsonwebtoken.verify(previewCookies[NEXT_PREVIEW_DATA_COOKIE], prerenderManifest.preview.previewModeSigningKey);
        }
        catch (e) {
            console.error("Failed preview mode verification for URI:", request.uri);
            return {
                status: "403",
                statusDescription: "Forbidden"
            };
        }
    }
    s3Origin.domainName = normalisedS3DomainName;
    S3Check: if (
    // Note: public files and static pages (HTML pages with no props) don't have JS files needed for preview mode, always serve from S3.
    isPublicFile ||
        isStaticPage ||
        (isHTMLPage && !isPreviewRequest) ||
        (hasFallback && !isPreviewRequest) ||
        (isDataReq && !isPreviewRequest)) {
        if (isPublicFile) {
            s3Origin.path = `${basePath}/public`;
            if (basePath) {
                request.uri = request.uri.replace(basePath, "");
            }
        }
        else if (isHTMLPage || hasFallback) {
            s3Origin.path = `${basePath}/static-pages`;
            const pageName = uri === "/" ? "/index" : uri;
            request.uri = `${pageName}.html`;
        }
        else if (isDataReq) {
            // We need to check whether data request is unmatched i.e routed to 404.html or _error.js
            const normalisedDataRequestUri = normaliseDataRequestUri(uri, manifest);
            const pagePath = router(manifest)(normalisedDataRequestUri);
            if (pagePath === "pages/404.html") {
                // Request static 404 page from s3
                s3Origin.path = `${basePath}/static-pages`;
                request.uri = pagePath.replace("pages", "");
            }
            else if (pagePath === "pages/_error.js" ||
                !prerenderManifest.routes[normalisedDataRequestUri]) {
                // Break to continue to SSR render in two cases:
                // 1. URI routes to _error.js
                // 2. URI is not unmatched, but it's not in prerendered routes, i.e this is an SSR data request, we need to SSR render the JSON
                break S3Check;
            }
            // Otherwise, this is an SSG data request, so continue to get the JSON from S3
        }
        addS3HostHeader(request, normalisedS3DomainName);
        return request;
    }
    const pagePath = router(manifest)(uri);
    if (pagePath.endsWith(".html") && !isPreviewRequest) {
        s3Origin.path = `${basePath}/static-pages`;
        request.uri = pagePath.replace("pages", "");
        addS3HostHeader(request, normalisedS3DomainName);
        return request;
    }
    const tBeforePageRequire = now();
    let page = require(`./${pagePath}`); // eslint-disable-line
    const tAfterPageRequire = now();
    log("require JS execution time", tBeforePageRequire, tAfterPageRequire);
    const tBeforeSSR = now();
    const { req, res, responsePromise } = nextAwsCloudfront(event.Records[0].cf, {
        enableHTTPCompression: manifest.enableHTTPCompression
    });
    try {
        // If page is _error.js, set status to 404 so _error.js will render a 404 page
        if (pagePath === "pages/_error.js") {
            res.statusCode = 404;
        }
        // Render page
        if (isDataReq) {
            const { renderOpts } = await page.renderReqToHTML(req, res, "passthrough");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(renderOpts.pageData));
        }
        else {
            await page.render(req, res);
        }
    }
    catch (error) {
        // Set status to 500 so _error.js will render a 500 page
        console.error(`Error rendering page: ${pagePath}. Error:\n${error}\nRendering Next.js error page.`);
        res.statusCode = 500;
        page = require("./pages/_error.js"); // eslint-disable-line
        await page.render(req, res);
    }
    const response = await responsePromise;
    const tAfterSSR = now();
    log("SSR execution time", tBeforeSSR, tAfterSSR);
    setCloudFrontResponseStatus(response, res);
    return response;
};
const handleOriginResponse = async ({ event, manifest, prerenderManifest }) => {
    var _a, _b;
    const response = event.Records[0].cf.response;
    const request = event.Records[0].cf.request;
    const { status } = response;
    if (status !== "403") {
        // Set 404 status code for 404.html page. We do not need normalised URI as it will always be "/404.html"
        if (request.uri === "/404.html") {
            response.status = "404";
            response.statusDescription = "Not Found";
        }
        return response;
    }
    // For PUT or DELETE just return the response as these should be unsupported S3 methods
    if (request.method === "PUT" || request.method === "DELETE") {
        return response;
    }
    const uri = normaliseUri(request.uri);
    const { domainName, region } = request.origin.s3;
    const bucketName = domainName.replace(`.s3.${region}.amazonaws.com`, "");
    // Lazily import only S3Client to reduce init times until actually needed
    const { S3Client } = await Promise.resolve().then(function () { return S3Client$1; });
    const s3 = new S3Client({
        region: (_b = (_a = request.origin) === null || _a === void 0 ? void 0 : _a.s3) === null || _b === void 0 ? void 0 : _b.region,
        maxAttempts: 3,
        retryStrategy: await buildS3RetryStrategy()
    });
    let pagePath;
    if (isDataRequest(uri) &&
        !(pagePath = router(manifest)(uri)).endsWith(".html")) {
        // eslint-disable-next-line
        const page = require(`./${pagePath}`);
        const { req, res, responsePromise } = nextAwsCloudfront(event.Records[0].cf, {
            enableHTTPCompression: manifest.enableHTTPCompression
        });
        const isSSG = !!page.getStaticProps;
        const { renderOpts, html } = await page.renderReqToHTML(req, res, "passthrough");
        if (isSSG) {
            const s3JsonParams = {
                Bucket: bucketName,
                Key: `${basePath}${basePath === "" ? "" : "/"}${uri.replace(/^\//, "")}`,
                Body: JSON.stringify(renderOpts.pageData),
                ContentType: "application/json"
            };
            const s3HtmlParams = {
                Bucket: bucketName,
                Key: `${basePath}${basePath === "" ? "" : "/"}static-pages/${request.uri
                    .replace(`/_next/data/${manifest.buildId}/`, "")
                    .replace(".json", ".html")}`,
                Body: html,
                ContentType: "text/html",
                CacheControl: "public, max-age=0, s-maxage=2678400, must-revalidate"
            };
            const { PutObjectCommand } = await Promise.resolve().then(function () { return PutObjectCommand$1; });
            await Promise.all([
                s3.send(new PutObjectCommand(s3JsonParams)),
                s3.send(new PutObjectCommand(s3HtmlParams))
            ]);
        }
        res.writeHead(200, response.headers);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(renderOpts.pageData));
        return await responsePromise;
    }
    else {
        const hasFallback = hasFallbackForUri(uri, prerenderManifest, manifest);
        if (!hasFallback)
            return response;
        // If route has fallback, return that page from S3, otherwise return 404 page
        let s3Key = `${basePath}${basePath === "" ? "" : "/"}static-pages${hasFallback.fallback || "/404.html"}`;
        const { GetObjectCommand } = await Promise.resolve().then(function () { return GetObjectCommand$1; });
        // S3 Body is stream per: https://github.com/aws/aws-sdk-js-v3/issues/1096
        const getStream = await Promise.resolve().then(function () { return index$1; });
        let bodyString;
        const s3Params = {
            Bucket: bucketName,
            Key: s3Key
        };
        const { Body } = await s3.send(new GetObjectCommand(s3Params));
        bodyString = await getStream.default(Body);
        return {
            status: hasFallback.fallback ? "200" : "404",
            statusDescription: hasFallback.fallback ? "OK" : "Not Found",
            headers: {
                ...response.headers,
                "content-type": [
                    {
                        key: "Content-Type",
                        value: "text/html"
                    }
                ],
                "cache-control": [
                    {
                        key: "Cache-Control",
                        value: "public, max-age=0, s-maxage=2678400, must-revalidate"
                    }
                ]
            },
            body: bodyString
        };
    }
};
const isOriginResponse = (event) => {
    return event.Records[0].cf.config.eventType === "origin-response";
};
const hasFallbackForUri = (uri, prerenderManifest, manifest) => {
    const { pages: { ssr, html } } = manifest;
    // Non-dynamic routes are prioritized over dynamic fallbacks, return false to ensure those get rendered instead
    if (ssr.nonDynamic[uri] || html.nonDynamic[uri]) {
        return false;
    }
    let foundFallback = undefined; // for later use to reduce duplicate work
    // Dynamic routes that does not have fallback are prioritized over dynamic fallback
    const isNonFallbackDynamicRoute = Object.values({
        ...ssr.dynamic,
        ...html.dynamic
    }).find((dynamicRoute) => {
        if (foundFallback) {
            return false;
        }
        const re = new RegExp(dynamicRoute.regex);
        const matchesRegex = re.test(uri);
        // If any dynamic route matches, check that this isn't one of the fallback routes in prerender manifest
        if (matchesRegex) {
            const matchesFallbackRoute = Object.keys(prerenderManifest.dynamicRoutes).find((prerenderManifestRoute) => {
                const fileMatchesPrerenderRoute = dynamicRoute.file === `pages${prerenderManifestRoute}.js`;
                if (fileMatchesPrerenderRoute) {
                    foundFallback =
                        prerenderManifest.dynamicRoutes[prerenderManifestRoute];
                }
                return fileMatchesPrerenderRoute;
            });
            return !matchesFallbackRoute;
        }
        else {
            return false;
        }
    });
    if (isNonFallbackDynamicRoute) {
        return false;
    }
    // If fallback previously found, return it to prevent additional regex matching
    if (foundFallback) {
        return foundFallback;
    }
    // Otherwise, try to match fallback against dynamic routes in prerender manifest
    return Object.values(prerenderManifest.dynamicRoutes).find((routeConfig) => {
        const re = new RegExp(routeConfig.routeRegex);
        return re.test(uri);
    });
};
// This sets CloudFront response for 404 or 500 statuses
const setCloudFrontResponseStatus = (response, res) => {
    if (res.statusCode == 404) {
        response.status = "404";
        response.statusDescription = "Not Found";
    }
    else if (res.statusCode == 500) {
        response.status = "500";
        response.statusDescription = "Internal Server Error";
    }
};

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics(d, b);
};

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read(arguments[i]));
    return ar;
}

function __await(v) {
    return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

var retryMiddleware = function (options) { return function (next) { return function (args) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/, options.retryStrategy.retry(next, args)];
}); }); }; }; };
var retryMiddlewareOptions = {
    name: "retryMiddleware",
    tags: ["RETRY"],
    step: "finalizeRequest",
    priority: "high",
};
var getRetryPlugin = function (options) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(retryMiddleware(options), retryMiddlewareOptions);
    },
}); };

var HttpResponse = /** @class */ (function () {
    function HttpResponse(options) {
        this.statusCode = options.statusCode;
        this.headers = options.headers || {};
        this.body = options.body;
    }
    HttpResponse.isInstance = function (response) {
        //determine if response is a valid HttpResponse
        if (!response)
            return false;
        var resp = response;
        return typeof resp.statusCode === "number" && typeof resp.headers === "object";
    };
    return HttpResponse;
}());

var HttpRequest = /** @class */ (function () {
    function HttpRequest(options) {
        this.method = options.method || "GET";
        this.hostname = options.hostname || "localhost";
        this.port = options.port;
        this.query = options.query || {};
        this.headers = options.headers || {};
        this.body = options.body;
        this.protocol = options.protocol
            ? options.protocol.substr(-1) !== ":"
                ? options.protocol + ":"
                : options.protocol
            : "https:";
        this.path = options.path ? (options.path.charAt(0) !== "/" ? "/" + options.path : options.path) : "/";
    }
    HttpRequest.isInstance = function (request) {
        //determine if request is a valid httpRequest
        if (!request)
            return false;
        var req = request;
        return ("method" in req &&
            "protocol" in req &&
            "hostname" in req &&
            "path" in req &&
            typeof req["query"] === "object" &&
            typeof req["headers"] === "object");
    };
    HttpRequest.prototype.clone = function () {
        var cloned = new HttpRequest(__assign(__assign({}, this), { headers: __assign({}, this.headers) }));
        if (cloned.query)
            cloned.query = cloneQuery(cloned.query);
        return cloned;
    };
    return HttpRequest;
}());
function cloneQuery(query) {
    return Object.keys(query).reduce(function (carry, paramName) {
        var _a;
        var param = query[paramName];
        return __assign(__assign({}, carry), (_a = {}, _a[paramName] = Array.isArray(param) ? __spread(param) : param, _a));
    }, {});
}

/**
 * Errors encountered when the client clock and server clock cannot agree on the
 * current time.
 *
 * These errors are retryable, assuming the SDK has enabled clock skew
 * correction.
 */
var CLOCK_SKEW_ERROR_CODES = [
    "AuthFailure",
    "InvalidSignatureException",
    "RequestExpired",
    "RequestInTheFuture",
    "RequestTimeTooSkewed",
    "SignatureDoesNotMatch",
];
/**
 * Errors that indicate the SDK is being throttled.
 *
 * These errors are always retryable.
 */
var THROTTLING_ERROR_CODES = [
    "Throttling",
    "ThrottlingException",
    "ThrottledException",
    "RequestThrottledException",
    "TooManyRequestsException",
    "ProvisionedThroughputExceededException",
    "TransactionInProgressException",
    "RequestLimitExceeded",
    "BandwidthLimitExceeded",
    "LimitExceededException",
    "RequestThrottled",
    "SlowDown",
    "PriorRequestNotComplete",
    "EC2ThrottledException",
];
/**
 * Error codes that indicate transient issues
 */
var TRANSIENT_ERROR_CODES = ["AbortError", "TimeoutError", "RequestTimeout", "RequestTimeoutException"];
/**
 * Error codes that indicate transient issues
 */
var TRANSIENT_ERROR_STATUS_CODES = [500, 502, 503, 504];

var isRetryableByTrait = function (error) { return error.$retryable !== undefined; };
var isClockSkewError = function (error) { return CLOCK_SKEW_ERROR_CODES.includes(error.name); };
var isThrottlingError = function (error) { var _a; return THROTTLING_ERROR_CODES.includes(error.name) || ((_a = error.$retryable) === null || _a === void 0 ? void 0 : _a.throttling) == true; };
var isTransientError = function (error) {
    var _a;
    return TRANSIENT_ERROR_CODES.includes(error.name) ||
        TRANSIENT_ERROR_STATUS_CODES.includes(((_a = error.$metadata) === null || _a === void 0 ? void 0 : _a.httpStatusCode) || 0);
};

// Unique ID creation requires a high quality random # generator.  In node.js
// this is pretty straight-forward - we use the crypto API.



var rng = function nodeRNG() {
  return crypto__default['default'].randomBytes(16);
};

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex = [];
for (var i = 0; i < 256; ++i) {
  byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
  var i = offset || 0;
  var bth = byteToHex;
  // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
  return ([
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]]
  ]).join('');
}

var bytesToUuid_1 = bytesToUuid;

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

var _nodeId;
var _clockseq;

// Previous uuid creation time
var _lastMSecs = 0;
var _lastNSecs = 0;

// See https://github.com/uuidjs/uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};
  var node = options.node || _nodeId;
  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // node and clockseq need to be initialized to random values if they're not
  // specified.  We do this lazily to minimize issues related to insufficient
  // system entropy.  See #189
  if (node == null || clockseq == null) {
    var seedBytes = rng();
    if (node == null) {
      // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
      node = _nodeId = [
        seedBytes[0] | 0x01,
        seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]
      ];
    }
    if (clockseq == null) {
      // Per 4.2.2, randomize (14 bit) clockseq
      clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 0x3fff;
    }
  }

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  for (var n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }

  return buf ? buf : bytesToUuid_1(b);
}

var v1_1 = v1;

function v4(options, buf, offset) {
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options === 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ++ii) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || bytesToUuid_1(rnds);
}

var v4_1 = v4;

var uuid = v4_1;
uuid.v1 = v1_1;
uuid.v4 = v4_1;

var uuid_1 = uuid;

/**
 * The base number of milliseconds to use in calculating a suitable cool-down
 * time when a retryable error is encountered.
 */
var DEFAULT_RETRY_DELAY_BASE = 100;
/**
 * The maximum amount of time (in milliseconds) that will be used as a delay
 * between retry attempts.
 */
var MAXIMUM_RETRY_DELAY = 20 * 1000;
/**
 * The retry delay base (in milliseconds) to use when a throttling error is
 * encountered.
 */
var THROTTLING_RETRY_DELAY_BASE = 500;
/**
 * Initial number of retry tokens in Retry Quota
 */
var INITIAL_RETRY_TOKENS = 500;
/**
 * The total amount of retry tokens to be decremented from retry token balance.
 */
var RETRY_COST = 5;
/**
 * The total amount of retry tokens to be decremented from retry token balance
 * when a throttling error is encountered.
 */
var TIMEOUT_RETRY_COST = 10;
/**
 * The total amount of retry token to be incremented from retry token balance
 * if an SDK operation invocation succeeds without requiring a retry request.
 */
var NO_RETRY_INCREMENT = 1;

var getDefaultRetryQuota = function (initialRetryTokens) {
    var MAX_CAPACITY = initialRetryTokens;
    var availableCapacity = initialRetryTokens;
    var getCapacityAmount = function (error) { return (error.name === "TimeoutError" ? TIMEOUT_RETRY_COST : RETRY_COST); };
    var hasRetryTokens = function (error) { return getCapacityAmount(error) <= availableCapacity; };
    var retrieveRetryTokens = function (error) {
        if (!hasRetryTokens(error)) {
            // retryStrategy should stop retrying, and return last error
            throw new Error("No retry token available");
        }
        var capacityAmount = getCapacityAmount(error);
        availableCapacity -= capacityAmount;
        return capacityAmount;
    };
    var releaseRetryTokens = function (capacityReleaseAmount) {
        availableCapacity += capacityReleaseAmount !== null && capacityReleaseAmount !== void 0 ? capacityReleaseAmount : NO_RETRY_INCREMENT;
        availableCapacity = Math.min(availableCapacity, MAX_CAPACITY);
    };
    return Object.freeze({
        hasRetryTokens: hasRetryTokens,
        retrieveRetryTokens: retrieveRetryTokens,
        releaseRetryTokens: releaseRetryTokens,
    });
};

/**
 * Calculate a capped, fully-jittered exponential backoff time.
 */
var defaultDelayDecider = function (delayBase, attempts) {
    return Math.floor(Math.min(MAXIMUM_RETRY_DELAY, Math.random() * Math.pow(2, attempts) * delayBase));
};

var defaultRetryDecider = function (error) {
    if (!error) {
        return false;
    }
    return isRetryableByTrait(error) || isClockSkewError(error) || isThrottlingError(error) || isTransientError(error);
};

/**
 * The default value for how many HTTP requests an SDK should make for a
 * single SDK operation invocation before giving up
 */
var DEFAULT_MAX_ATTEMPTS = 3;
/**
 * The default retry algorithm to use.
 */
var DEFAULT_RETRY_MODE = "standard";
var StandardRetryStrategy = /** @class */ (function () {
    function StandardRetryStrategy(maxAttemptsProvider, options) {
        var _a, _b, _c;
        this.maxAttemptsProvider = maxAttemptsProvider;
        this.retryDecider = (_a = options === null || options === void 0 ? void 0 : options.retryDecider) !== null && _a !== void 0 ? _a : defaultRetryDecider;
        this.delayDecider = (_b = options === null || options === void 0 ? void 0 : options.delayDecider) !== null && _b !== void 0 ? _b : defaultDelayDecider;
        this.retryQuota = (_c = options === null || options === void 0 ? void 0 : options.retryQuota) !== null && _c !== void 0 ? _c : getDefaultRetryQuota(INITIAL_RETRY_TOKENS);
    }
    StandardRetryStrategy.prototype.shouldRetry = function (error, attempts, maxAttempts) {
        return attempts < maxAttempts && this.retryDecider(error) && this.retryQuota.hasRetryTokens(error);
    };
    StandardRetryStrategy.prototype.getMaxAttempts = function () {
        return __awaiter(this, void 0, void 0, function () {
            var maxAttempts, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.maxAttemptsProvider()];
                    case 1:
                        maxAttempts = _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        maxAttempts = DEFAULT_MAX_ATTEMPTS;
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/, maxAttempts];
                }
            });
        });
    };
    StandardRetryStrategy.prototype.retry = function (next, args) {
        return __awaiter(this, void 0, void 0, function () {
            var retryTokenAmount, attempts, totalDelay, maxAttempts, request, _loop_1, this_1, state_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        attempts = 0;
                        totalDelay = 0;
                        return [4 /*yield*/, this.getMaxAttempts()];
                    case 1:
                        maxAttempts = _a.sent();
                        request = args.request;
                        if (HttpRequest.isInstance(request)) {
                            request.headers["amz-sdk-invocation-id"] = uuid_1.v4();
                        }
                        _loop_1 = function () {
                            var _a, response, output, err_1, delay_1;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        _b.trys.push([0, 2, , 5]);
                                        if (HttpRequest.isInstance(request)) {
                                            request.headers["amz-sdk-request"] = "attempt=" + (attempts + 1) + "; max=" + maxAttempts;
                                        }
                                        return [4 /*yield*/, next(args)];
                                    case 1:
                                        _a = _b.sent(), response = _a.response, output = _a.output;
                                        this_1.retryQuota.releaseRetryTokens(retryTokenAmount);
                                        output.$metadata.attempts = attempts + 1;
                                        output.$metadata.totalRetryDelay = totalDelay;
                                        return [2 /*return*/, { value: { response: response, output: output } }];
                                    case 2:
                                        err_1 = _b.sent();
                                        attempts++;
                                        if (!this_1.shouldRetry(err_1, attempts, maxAttempts)) return [3 /*break*/, 4];
                                        retryTokenAmount = this_1.retryQuota.retrieveRetryTokens(err_1);
                                        delay_1 = this_1.delayDecider(isThrottlingError(err_1) ? THROTTLING_RETRY_DELAY_BASE : DEFAULT_RETRY_DELAY_BASE, attempts);
                                        totalDelay += delay_1;
                                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                    case 3:
                                        _b.sent();
                                        return [2 /*return*/, "continue"];
                                    case 4:
                                        if (!err_1.$metadata) {
                                            err_1.$metadata = {};
                                        }
                                        err_1.$metadata.attempts = attempts;
                                        err_1.$metadata.totalRetryDelay = totalDelay;
                                        throw err_1;
                                    case 5: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _a.label = 2;
                    case 2:
                        return [5 /*yield**/, _loop_1()];
                    case 3:
                        state_1 = _a.sent();
                        if (typeof state_1 === "object")
                            return [2 /*return*/, state_1.value];
                        return [3 /*break*/, 2];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return StandardRetryStrategy;
}());

var ENV_MAX_ATTEMPTS = "AWS_MAX_ATTEMPTS";
var CONFIG_MAX_ATTEMPTS = "max_attempts";
var NODE_MAX_ATTEMPT_CONFIG_OPTIONS = {
    environmentVariableSelector: function (env) {
        var value = env[ENV_MAX_ATTEMPTS];
        if (!value)
            return undefined;
        var maxAttempt = parseInt(value);
        if (Number.isNaN(maxAttempt)) {
            throw new Error("Environment variable " + ENV_MAX_ATTEMPTS + " mast be a number, got \"" + value + "\"");
        }
        return maxAttempt;
    },
    configFileSelector: function (profile) {
        var value = profile[CONFIG_MAX_ATTEMPTS];
        if (!value)
            return undefined;
        var maxAttempt = parseInt(value);
        if (Number.isNaN(maxAttempt)) {
            throw new Error("Shared config file entry " + CONFIG_MAX_ATTEMPTS + " mast be a number, got \"" + value + "\"");
        }
        return maxAttempt;
    },
    default: DEFAULT_MAX_ATTEMPTS,
};
var resolveRetryConfig = function (input) {
    var maxAttempts = normalizeMaxAttempts(input.maxAttempts);
    return __assign(__assign({}, input), { maxAttempts: maxAttempts, retryStrategy: input.retryStrategy || new StandardRetryStrategy(maxAttempts) });
};
var normalizeMaxAttempts = function (maxAttempts) {
    if (maxAttempts === void 0) { maxAttempts = DEFAULT_MAX_ATTEMPTS; }
    if (typeof maxAttempts === "number") {
        var promisified_1 = Promise.resolve(maxAttempts);
        return function () { return promisified_1; };
    }
    return maxAttempts;
};
var ENV_RETRY_MODE = "AWS_RETRY_MODE";
var CONFIG_RETRY_MODE = "retry_mode";
var NODE_RETRY_MODE_CONFIG_OPTIONS = {
    environmentVariableSelector: function (env) { return env[ENV_RETRY_MODE]; },
    configFileSelector: function (profile) { return profile[CONFIG_RETRY_MODE]; },
    default: DEFAULT_RETRY_MODE,
};

var index = /*#__PURE__*/Object.freeze({
  __proto__: null,
  retryMiddleware: retryMiddleware,
  retryMiddlewareOptions: retryMiddlewareOptions,
  getRetryPlugin: getRetryPlugin,
  DEFAULT_MAX_ATTEMPTS: DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_MODE: DEFAULT_RETRY_MODE,
  StandardRetryStrategy: StandardRetryStrategy,
  ENV_MAX_ATTEMPTS: ENV_MAX_ATTEMPTS,
  CONFIG_MAX_ATTEMPTS: CONFIG_MAX_ATTEMPTS,
  NODE_MAX_ATTEMPT_CONFIG_OPTIONS: NODE_MAX_ATTEMPT_CONFIG_OPTIONS,
  resolveRetryConfig: resolveRetryConfig,
  ENV_RETRY_MODE: ENV_RETRY_MODE,
  CONFIG_RETRY_MODE: CONFIG_RETRY_MODE,
  NODE_RETRY_MODE_CONFIG_OPTIONS: NODE_RETRY_MODE_CONFIG_OPTIONS,
  defaultDelayDecider: defaultDelayDecider,
  defaultRetryDecider: defaultRetryDecider
});

var name = "@aws-sdk/client-s3";
var description = "AWS SDK for JavaScript S3 Client for Node.js, Browser and React Native";
var version = "1.0.0-rc.3";
var scripts = {
	clean: "npm run remove-definitions && npm run remove-dist",
	"build-documentation": "npm run clean && typedoc ./",
	prepublishOnly: "yarn build",
	pretest: "yarn build:cjs",
	"remove-definitions": "rimraf ./types",
	"remove-dist": "rimraf ./dist",
	"remove-documentation": "rimraf ./docs",
	"test:unit": "mocha **/cjs/**/*.spec.js",
	"test:e2e": "mocha **/cjs/**/*.ispec.js && karma start karma.conf.js",
	test: "yarn test:unit",
	"build:cjs": "tsc -p tsconfig.json",
	"build:es": "tsc -p tsconfig.es.json",
	build: "yarn build:cjs && yarn build:es"
};
var main = "./dist/cjs/index.js";
var types = "./types/index.d.ts";
var module$1 = "./dist/es/index.js";
var browser = {
	"./runtimeConfig": "./runtimeConfig.browser"
};
var sideEffects = false;
var dependencies = {
	"@aws-crypto/sha256-browser": "^1.0.0",
	"@aws-crypto/sha256-js": "^1.0.0",
	"@aws-sdk/config-resolver": "1.0.0-rc.3",
	"@aws-sdk/credential-provider-node": "1.0.0-rc.3",
	"@aws-sdk/eventstream-serde-browser": "1.0.0-rc.3",
	"@aws-sdk/eventstream-serde-config-resolver": "1.0.0-rc.3",
	"@aws-sdk/eventstream-serde-node": "1.0.0-rc.3",
	"@aws-sdk/fetch-http-handler": "1.0.0-rc.3",
	"@aws-sdk/hash-blob-browser": "1.0.0-rc.3",
	"@aws-sdk/hash-node": "1.0.0-rc.3",
	"@aws-sdk/hash-stream-node": "1.0.0-rc.3",
	"@aws-sdk/invalid-dependency": "1.0.0-rc.3",
	"@aws-sdk/md5-js": "1.0.0-rc.3",
	"@aws-sdk/middleware-apply-body-checksum": "1.0.0-rc.3",
	"@aws-sdk/middleware-bucket-endpoint": "1.0.0-rc.3",
	"@aws-sdk/middleware-content-length": "1.0.0-rc.3",
	"@aws-sdk/middleware-expect-continue": "1.0.0-rc.3",
	"@aws-sdk/middleware-host-header": "1.0.0-rc.3",
	"@aws-sdk/middleware-location-constraint": "1.0.0-rc.3",
	"@aws-sdk/middleware-logger": "1.0.0-rc.3",
	"@aws-sdk/middleware-retry": "1.0.0-rc.3",
	"@aws-sdk/middleware-sdk-s3": "1.0.0-rc.3",
	"@aws-sdk/middleware-serde": "1.0.0-rc.3",
	"@aws-sdk/middleware-signing": "1.0.0-rc.3",
	"@aws-sdk/middleware-ssec": "1.0.0-rc.3",
	"@aws-sdk/middleware-stack": "1.0.0-rc.3",
	"@aws-sdk/middleware-user-agent": "1.0.0-rc.3",
	"@aws-sdk/node-config-provider": "1.0.0-rc.3",
	"@aws-sdk/node-http-handler": "1.0.0-rc.3",
	"@aws-sdk/protocol-http": "1.0.0-rc.3",
	"@aws-sdk/smithy-client": "1.0.0-rc.3",
	"@aws-sdk/types": "1.0.0-rc.3",
	"@aws-sdk/url-parser-browser": "1.0.0-rc.3",
	"@aws-sdk/url-parser-node": "1.0.0-rc.3",
	"@aws-sdk/util-base64-browser": "1.0.0-rc.3",
	"@aws-sdk/util-base64-node": "1.0.0-rc.3",
	"@aws-sdk/util-body-length-browser": "1.0.0-rc.3",
	"@aws-sdk/util-body-length-node": "1.0.0-rc.3",
	"@aws-sdk/util-user-agent-browser": "1.0.0-rc.3",
	"@aws-sdk/util-user-agent-node": "1.0.0-rc.3",
	"@aws-sdk/util-utf8-browser": "1.0.0-rc.3",
	"@aws-sdk/util-utf8-node": "1.0.0-rc.3",
	"@aws-sdk/xml-builder": "1.0.0-rc.3",
	"fast-xml-parser": "^3.16.0",
	tslib: "^2.0.0"
};
var devDependencies = {
	"@aws-sdk/client-documentation-generator": "1.0.0-rc.3",
	"@types/chai": "^4.2.11",
	"@types/mocha": "^7.0.2",
	"@types/node": "^12.7.5",
	jest: "^26.1.0",
	rimraf: "^3.0.0",
	typedoc: "^0.17.8",
	typescript: "~4.0.2"
};
var engines = {
	node: ">=10.0.0"
};
var author = {
	name: "AWS SDK for JavaScript Team",
	url: "https://aws.amazon.com/javascript/"
};
var license = "Apache-2.0";
var homepage = "https://github.com/aws/aws-sdk-js-v3/tree/master/clients/client-s3";
var repository = {
	type: "git",
	url: "https://github.com/aws/aws-sdk-js-v3.git",
	directory: "clients/client-s3"
};
var packageInfo = {
	name: name,
	description: description,
	version: version,
	scripts: scripts,
	main: main,
	types: types,
	module: module$1,
	browser: browser,
	"react-native": {
	"./runtimeConfig": "./runtimeConfig.native"
},
	sideEffects: sideEffects,
	dependencies: dependencies,
	devDependencies: devDependencies,
	engines: engines,
	author: author,
	license: license,
	homepage: homepage,
	repository: repository
};

var resolveEndpointsConfig = function (input) {
    var _a;
    return (__assign(__assign({}, input), { tls: (_a = input.tls) !== null && _a !== void 0 ? _a : true, endpoint: input.endpoint ? normalizeEndpoint(input) : function () { return getEndPointFromRegion(input); }, isCustomEndpoint: input.endpoint ? true : false }));
};
var normalizeEndpoint = function (input) {
    var endpoint = input.endpoint, urlParser = input.urlParser;
    if (typeof endpoint === "string") {
        var promisified_1 = Promise.resolve(urlParser(endpoint));
        return function () { return promisified_1; };
    }
    else if (typeof endpoint === "object") {
        var promisified_2 = Promise.resolve(endpoint);
        return function () { return promisified_2; };
    }
    return endpoint;
};
var getEndPointFromRegion = function (input) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, tls, region, dnsHostRegex, hostname;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _a = input.tls, tls = _a === void 0 ? true : _a;
                return [4 /*yield*/, input.region()];
            case 1:
                region = _c.sent();
                dnsHostRegex = new RegExp(/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])$/);
                if (!dnsHostRegex.test(region)) {
                    throw new Error("Invalid region in client config");
                }
                return [4 /*yield*/, input.regionInfoProvider(region)];
            case 2:
                hostname = ((_b = (_c.sent())) !== null && _b !== void 0 ? _b : {}).hostname;
                if (!hostname) {
                    throw new Error("Cannot resolve hostname from client config");
                }
                return [2 /*return*/, input.urlParser((tls ? "https:" : "http:") + "//" + hostname)];
        }
    });
}); };

var REGION_ENV_NAME = "AWS_REGION";
var REGION_INI_NAME = "region";
var NODE_REGION_CONFIG_OPTIONS = {
    environmentVariableSelector: function (env) { return env[REGION_ENV_NAME]; },
    configFileSelector: function (profile) { return profile[REGION_INI_NAME]; },
    default: function () {
        throw new Error("Region is missing");
    },
};
var NODE_REGION_CONFIG_FILE_OPTIONS = {
    preferredFile: "credentials",
};
var resolveRegionConfig = function (input) {
    if (!input.region) {
        throw new Error("Region is missing");
    }
    return __assign(__assign({}, input), { region: normalizeRegion(input.region) });
};
var normalizeRegion = function (region) {
    if (typeof region === "string") {
        var promisified_1 = Promise.resolve(region);
        return function () { return promisified_1; };
    }
    return region;
};

/**
 * An error representing a failure of an individual credential provider.
 *
 * This error class has special meaning to the {@link chain} method. If a
 * provider in the chain is rejected with an error, the chain will only proceed
 * to the next provider if the value of the `tryNextLink` property on the error
 * is truthy. This allows individual providers to halt the chain and also
 * ensures the chain will stop if an entirely unexpected error is encountered.
 */
var ProviderError = /** @class */ (function (_super) {
    __extends(ProviderError, _super);
    function ProviderError(message, tryNextLink) {
        if (tryNextLink === void 0) { tryNextLink = true; }
        var _this = _super.call(this, message) || this;
        _this.tryNextLink = tryNextLink;
        return _this;
    }
    return ProviderError;
}(Error));

/**
 * Compose a single credential provider function from multiple credential
 * providers. The first provider in the argument list will always be invoked;
 * subsequent providers in the list will be invoked in the order in which the
 * were received if the preceding provider did not successfully resolve.
 *
 * If no providers were received or no provider resolves successfully, the
 * returned promise will be rejected.
 */
function chain() {
    var providers = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        providers[_i] = arguments[_i];
    }
    return function () {
        var e_1, _a;
        var promise = Promise.reject(new ProviderError("No providers in chain"));
        var _loop_1 = function (provider) {
            promise = promise.catch(function (err) {
                if (err === null || err === void 0 ? void 0 : err.tryNextLink) {
                    return provider();
                }
                throw err;
            });
        };
        try {
            for (var providers_1 = __values(providers), providers_1_1 = providers_1.next(); !providers_1_1.done; providers_1_1 = providers_1.next()) {
                var provider = providers_1_1.value;
                _loop_1(provider);
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (providers_1_1 && !providers_1_1.done && (_a = providers_1.return)) _a.call(providers_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return promise;
    };
}

var fromStatic = function (staticValue) { return function () { return Promise.resolve(staticValue); }; };

var memoize = function (provider, isExpired, requiresRefresh) {
    var result;
    var hasResult;
    if (isExpired === undefined) {
        // This is a static memoization; no need to incorporate refreshing
        return function () {
            if (!hasResult) {
                result = provider();
                hasResult = true;
            }
            return result;
        };
    }
    var isConstant = false;
    return function () { return __awaiter(void 0, void 0, void 0, function () {
        var resolved;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!hasResult) {
                        result = provider();
                        hasResult = true;
                    }
                    if (isConstant) {
                        return [2 /*return*/, result];
                    }
                    return [4 /*yield*/, result];
                case 1:
                    resolved = _a.sent();
                    if (requiresRefresh && !requiresRefresh(resolved)) {
                        isConstant = true;
                        return [2 /*return*/, resolved];
                    }
                    if (isExpired(resolved)) {
                        return [2 /*return*/, (result = provider())];
                    }
                    return [2 /*return*/, resolved];
            }
        });
    }); };
};

var ENV_KEY = "AWS_ACCESS_KEY_ID";
var ENV_SECRET = "AWS_SECRET_ACCESS_KEY";
var ENV_SESSION = "AWS_SESSION_TOKEN";
var ENV_EXPIRATION = "AWS_CREDENTIAL_EXPIRATION";
/**
 * Source AWS credentials from known environment variables. If either the
 * `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` environment variable is not
 * set in this process, the provider will return a rejected promise.
 */
function fromEnv() {
    return function () {
        var accessKeyId = process.env[ENV_KEY];
        var secretAccessKey = process.env[ENV_SECRET];
        var expiry = process.env[ENV_EXPIRATION];
        if (accessKeyId && secretAccessKey) {
            return Promise.resolve({
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey,
                sessionToken: process.env[ENV_SESSION],
                expiration: expiry ? new Date(expiry) : undefined,
            });
        }
        return Promise.reject(new ProviderError("Unable to find environment variable credentials."));
    };
}

/**
 * @internal
 */
function httpRequest(options) {
    return new Promise(function (resolve, reject) {
        var req = http.request(__assign({ method: "GET" }, options));
        req.on("error", function (err) {
            reject(Object.assign(new ProviderError("Unable to connect to instance metadata service"), err));
        });
        req.on("timeout", function () {
            reject(new Error("TimeoutError"));
        });
        req.on("response", function (res) {
            var _a = res.statusCode, statusCode = _a === void 0 ? 400 : _a;
            if (statusCode < 200 || 300 <= statusCode) {
                reject(Object.assign(new ProviderError("Error response received from instance metadata service"), { statusCode: statusCode }));
            }
            var chunks = [];
            res.on("data", function (chunk) {
                chunks.push(chunk);
            });
            res.on("end", function () {
                resolve(buffer$1.Buffer.concat(chunks));
            });
        });
        req.end();
    });
}

var isImdsCredentials = function (arg) {
    return Boolean(arg) &&
        typeof arg === "object" &&
        typeof arg.AccessKeyId === "string" &&
        typeof arg.SecretAccessKey === "string" &&
        typeof arg.Token === "string" &&
        typeof arg.Expiration === "string";
};
var fromImdsCredentials = function (creds) { return ({
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.Token,
    expiration: new Date(creds.Expiration),
}); };

var DEFAULT_TIMEOUT = 1000;
// The default in AWS SDK for Python and CLI (botocore) is no retry or one attempt
// https://github.com/boto/botocore/blob/646c61a7065933e75bab545b785e6098bc94c081/botocore/utils.py#L273
var DEFAULT_MAX_RETRIES = 0;
var providerConfigFromInit = function (_a) {
    var _b = _a.maxRetries, maxRetries = _b === void 0 ? DEFAULT_MAX_RETRIES : _b, _c = _a.timeout, timeout = _c === void 0 ? DEFAULT_TIMEOUT : _c;
    return ({ maxRetries: maxRetries, timeout: timeout });
};

/**
 * @internal
 */
var retry = function (toRetry, maxRetries) {
    var promise = toRetry();
    for (var i = 0; i < maxRetries; i++) {
        promise = promise.catch(toRetry);
    }
    return promise;
};

var ENV_CMDS_FULL_URI = "AWS_CONTAINER_CREDENTIALS_FULL_URI";
var ENV_CMDS_RELATIVE_URI = "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI";
var ENV_CMDS_AUTH_TOKEN = "AWS_CONTAINER_AUTHORIZATION_TOKEN";
/**
 * Creates a credential provider that will source credentials from the ECS
 * Container Metadata Service
 */
function fromContainerMetadata(init) {
    var _this = this;
    if (init === void 0) { init = {}; }
    var _a = providerConfigFromInit(init), timeout = _a.timeout, maxRetries = _a.maxRetries;
    return function () {
        return getCmdsUri().then(function (url) {
            return retry(function () { return __awaiter(_this, void 0, void 0, function () {
                var credsResponse, _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = JSON).parse;
                            return [4 /*yield*/, requestFromEcsImds(timeout, url)];
                        case 1:
                            credsResponse = _b.apply(_a, [_c.sent()]);
                            if (!isImdsCredentials(credsResponse)) {
                                throw new ProviderError("Invalid response received from instance metadata service.");
                            }
                            return [2 /*return*/, fromImdsCredentials(credsResponse)];
                    }
                });
            }); }, maxRetries);
        });
    };
}
function requestFromEcsImds(timeout, options) {
    if (process.env[ENV_CMDS_AUTH_TOKEN]) {
        var _a = options.headers, headers = _a === void 0 ? {} : _a;
        headers.Authorization = process.env[ENV_CMDS_AUTH_TOKEN];
        options.headers = headers;
    }
    return httpRequest(__assign(__assign({}, options), { timeout: timeout })).then(function (buffer) { return buffer.toString(); });
}
var CMDS_IP = "169.254.170.2";
var GREENGRASS_HOSTS = {
    localhost: true,
    "127.0.0.1": true,
};
var GREENGRASS_PROTOCOLS = {
    "http:": true,
    "https:": true,
};
function getCmdsUri() {
    if (process.env[ENV_CMDS_RELATIVE_URI]) {
        return Promise.resolve({
            hostname: CMDS_IP,
            path: process.env[ENV_CMDS_RELATIVE_URI],
        });
    }
    if (process.env[ENV_CMDS_FULL_URI]) {
        var parsed = url.parse(process.env[ENV_CMDS_FULL_URI]);
        if (!parsed.hostname || !(parsed.hostname in GREENGRASS_HOSTS)) {
            return Promise.reject(new ProviderError(parsed.hostname + " is not a valid container metadata service hostname", false));
        }
        if (!parsed.protocol || !(parsed.protocol in GREENGRASS_PROTOCOLS)) {
            return Promise.reject(new ProviderError(parsed.protocol + " is not a valid container metadata service protocol", false));
        }
        return Promise.resolve(__assign(__assign({}, parsed), { port: parsed.port ? parseInt(parsed.port, 10) : undefined }));
    }
    return Promise.reject(new ProviderError("The container metadata credential provider cannot be used unless" +
        (" the " + ENV_CMDS_RELATIVE_URI + " or " + ENV_CMDS_FULL_URI + " environment") +
        " variable is set", false));
}

var IMDS_IP = "169.254.169.254";
var IMDS_PATH = "/latest/meta-data/iam/security-credentials/";
var IMDS_TOKEN_PATH = "/latest/api/token";
/**
 * Creates a credential provider that will source credentials from the EC2
 * Instance Metadata Service
 */
var fromInstanceMetadata = function (init) {
    if (init === void 0) { init = {}; }
    // when set to true, metadata service will not fetch token
    var disableFetchToken = false;
    var _a = providerConfigFromInit(init), timeout = _a.timeout, maxRetries = _a.maxRetries;
    var getCredentials = function (maxRetries, options) { return __awaiter(void 0, void 0, void 0, function () {
        var profile;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, retry(function () { return __awaiter(void 0, void 0, void 0, function () {
                        var profile, err_1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, getProfile(options)];
                                case 1:
                                    profile = _a.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    err_1 = _a.sent();
                                    if (err_1.statusCode === 401) {
                                        disableFetchToken = false;
                                    }
                                    throw err_1;
                                case 3: return [2 /*return*/, profile];
                            }
                        });
                    }); }, maxRetries)];
                case 1:
                    profile = (_a.sent()).trim();
                    return [2 /*return*/, retry(function () { return __awaiter(void 0, void 0, void 0, function () {
                            var creds, err_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 2, , 3]);
                                        return [4 /*yield*/, getCredentialsFromProfile(profile, options)];
                                    case 1:
                                        creds = _a.sent();
                                        return [3 /*break*/, 3];
                                    case 2:
                                        err_2 = _a.sent();
                                        if (err_2.statusCode === 401) {
                                            disableFetchToken = false;
                                        }
                                        throw err_2;
                                    case 3: return [2 /*return*/, creds];
                                }
                            });
                        }); }, maxRetries)];
            }
        });
    }); };
    return function () { return __awaiter(void 0, void 0, void 0, function () {
        var token, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!disableFetchToken) return [3 /*break*/, 1];
                    return [2 /*return*/, getCredentials(maxRetries, { timeout: timeout })];
                case 1:
                    token = void 0;
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, getMetadataToken({ timeout: timeout })];
                case 3:
                    token = (_a.sent()).toString();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    if ((error_1 === null || error_1 === void 0 ? void 0 : error_1.statusCode) === 400) {
                        throw Object.assign(error_1, {
                            message: "EC2 Metadata token request returned error",
                        });
                    }
                    else if (error_1.message === "TimeoutError" || [403, 404, 405].includes(error_1.statusCode)) {
                        disableFetchToken = true;
                    }
                    return [2 /*return*/, getCredentials(maxRetries, { timeout: timeout })];
                case 5: return [2 /*return*/, getCredentials(maxRetries, {
                        timeout: timeout,
                        headers: {
                            "x-aws-ec2-metadata-token": token,
                        },
                    })];
            }
        });
    }); };
};
var getMetadataToken = function (options) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, httpRequest(__assign(__assign({}, options), { host: IMDS_IP, path: IMDS_TOKEN_PATH, method: "PUT", headers: {
                    "x-aws-ec2-metadata-token-ttl-seconds": "21600",
                } }))];
    });
}); };
var getProfile = function (options) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    switch (_a.label) {
        case 0: return [4 /*yield*/, httpRequest(__assign(__assign({}, options), { host: IMDS_IP, path: IMDS_PATH }))];
        case 1: return [2 /*return*/, (_a.sent()).toString()];
    }
}); }); };
var getCredentialsFromProfile = function (profile, options) { return __awaiter(void 0, void 0, void 0, function () {
    var credsResponse, _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _b = (_a = JSON).parse;
                return [4 /*yield*/, httpRequest(__assign(__assign({}, options), { host: IMDS_IP, path: IMDS_PATH + profile }))];
            case 1:
                credsResponse = _b.apply(_a, [(_c.sent()).toString()]);
                if (!isImdsCredentials(credsResponse)) {
                    throw new ProviderError("Invalid response received from instance metadata service.");
                }
                return [2 /*return*/, fromImdsCredentials(credsResponse)];
        }
    });
}); };

var ENV_CREDENTIALS_PATH = "AWS_SHARED_CREDENTIALS_FILE";
var ENV_CONFIG_PATH = "AWS_CONFIG_FILE";
var swallowError = function () { return ({}); };
function loadSharedConfigFiles(init) {
    if (init === void 0) { init = {}; }
    var _a = init.filepath, filepath = _a === void 0 ? process.env[ENV_CREDENTIALS_PATH] || path.join(getHomeDir(), ".aws", "credentials") : _a, _b = init.configFilepath, configFilepath = _b === void 0 ? process.env[ENV_CONFIG_PATH] || path.join(getHomeDir(), ".aws", "config") : _b;
    return Promise.all([
        slurpFile(configFilepath).then(parseIni).then(normalizeConfigFile).catch(swallowError),
        slurpFile(filepath).then(parseIni).catch(swallowError),
    ]).then(function (parsedFiles) {
        var _a = __read(parsedFiles, 2), configFile = _a[0], credentialsFile = _a[1];
        return {
            configFile: configFile,
            credentialsFile: credentialsFile,
        };
    });
}
var profileKeyRegex = /^profile\s(["'])?([^\1]+)\1$/;
function normalizeConfigFile(data) {
    var e_1, _a;
    var map = {};
    try {
        for (var _b = __values(Object.keys(data)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var key = _c.value;
            var matches = void 0;
            if (key === "default") {
                map.default = data.default;
            }
            else if ((matches = profileKeyRegex.exec(key))) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                var _d = __read(matches, 3), _1 = _d[0], _2 = _d[1], normalizedKey = _d[2];
                if (normalizedKey) {
                    map[normalizedKey] = data[key];
                }
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return map;
}
function parseIni(iniData) {
    var e_2, _a;
    var map = {};
    var currentSection;
    try {
        for (var _b = __values(iniData.split(/\r?\n/)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var line = _c.value;
            line = line.split(/(^|\s)[;#]/)[0]; // remove comments
            var section = line.match(/^\s*\[([^\[\]]+)]\s*$/);
            if (section) {
                currentSection = section[1];
            }
            else if (currentSection) {
                var item = line.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
                if (item) {
                    map[currentSection] = map[currentSection] || {};
                    map[currentSection][item[1]] = item[2];
                }
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return map;
}
function slurpFile(path) {
    return new Promise(function (resolve, reject) {
        fs.readFile(path, "utf8", function (err, data) {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}
function getHomeDir() {
    var _a = process.env, HOME = _a.HOME, USERPROFILE = _a.USERPROFILE, HOMEPATH = _a.HOMEPATH, _b = _a.HOMEDRIVE, HOMEDRIVE = _b === void 0 ? "C:" + path.sep : _b;
    if (HOME)
        return HOME;
    if (USERPROFILE)
        return USERPROFILE;
    if (HOMEPATH)
        return "" + HOMEDRIVE + HOMEPATH;
    return os.homedir();
}

var DEFAULT_PROFILE = "default";
var ENV_PROFILE = "AWS_PROFILE";
function isStaticCredsProfile(arg) {
    return (Boolean(arg) &&
        typeof arg === "object" &&
        typeof arg.aws_access_key_id === "string" &&
        typeof arg.aws_secret_access_key === "string" &&
        ["undefined", "string"].indexOf(typeof arg.aws_session_token) > -1);
}
function isAssumeRoleProfile(arg) {
    return (Boolean(arg) &&
        typeof arg === "object" &&
        typeof arg.role_arn === "string" &&
        typeof arg.source_profile === "string" &&
        ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1 &&
        ["undefined", "string"].indexOf(typeof arg.external_id) > -1 &&
        ["undefined", "string"].indexOf(typeof arg.mfa_serial) > -1);
}
/**
 * Creates a credential provider that will read from ini files and supports
 * role assumption and multi-factor authentication.
 */
function fromIni(init) {
    if (init === void 0) { init = {}; }
    return function () { return parseKnownFiles(init).then(function (profiles) { return resolveProfileData(getMasterProfileName(init), profiles, init); }); };
}
function getMasterProfileName(init) {
    return init.profile || process.env[ENV_PROFILE] || DEFAULT_PROFILE;
}
function resolveProfileData(profileName, profiles, options, visitedProfiles) {
    if (visitedProfiles === void 0) { visitedProfiles = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var data, ExternalId, mfa_serial, RoleArn, _a, RoleSessionName, source_profile, sourceCreds, params, _b, _c, _d;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    data = profiles[profileName];
                    // If this is not the first profile visited, static credentials should be
                    // preferred over role assumption metadata. This special treatment of
                    // second and subsequent hops is to ensure compatibility with the AWS CLI.
                    if (Object.keys(visitedProfiles).length > 0 && isStaticCredsProfile(data)) {
                        return [2 /*return*/, resolveStaticCredentials(data)];
                    }
                    if (!isAssumeRoleProfile(data)) return [3 /*break*/, 4];
                    ExternalId = data.external_id, mfa_serial = data.mfa_serial, RoleArn = data.role_arn, _a = data.role_session_name, RoleSessionName = _a === void 0 ? "aws-sdk-js-" + Date.now() : _a, source_profile = data.source_profile;
                    if (!options.roleAssumer) {
                        throw new ProviderError("Profile " + profileName + " requires a role to be assumed, but no" + " role assumption callback was provided.", false);
                    }
                    if (source_profile in visitedProfiles) {
                        throw new ProviderError("Detected a cycle attempting to resolve credentials for profile" +
                            (" " + getMasterProfileName(options) + ". Profiles visited: ") +
                            Object.keys(visitedProfiles).join(", "), false);
                    }
                    sourceCreds = resolveProfileData(source_profile, profiles, options, __assign(__assign({}, visitedProfiles), (_e = {}, _e[source_profile] = true, _e)));
                    params = { RoleArn: RoleArn, RoleSessionName: RoleSessionName, ExternalId: ExternalId };
                    if (!mfa_serial) return [3 /*break*/, 2];
                    if (!options.mfaCodeProvider) {
                        throw new ProviderError("Profile " + profileName + " requires multi-factor authentication," + " but no MFA code callback was provided.", false);
                    }
                    params.SerialNumber = mfa_serial;
                    _b = params;
                    return [4 /*yield*/, options.mfaCodeProvider(mfa_serial)];
                case 1:
                    _b.TokenCode = _f.sent();
                    _f.label = 2;
                case 2:
                    _d = (_c = options).roleAssumer;
                    return [4 /*yield*/, sourceCreds];
                case 3: return [2 /*return*/, _d.apply(_c, [_f.sent(), params])];
                case 4:
                    // If no role assumption metadata is present, attempt to load static
                    // credentials from the selected profile.
                    if (isStaticCredsProfile(data)) {
                        return [2 /*return*/, resolveStaticCredentials(data)];
                    }
                    // If the profile cannot be parsed or contains neither static credentials
                    // nor role assumption metadata, throw an error. This should be considered a
                    // terminal resolution error if a profile has been specified by the user
                    // (whether via a parameter, an environment variable, or another profile's
                    // `source_profile` key).
                    throw new ProviderError("Profile " + profileName + " could not be found or parsed in shared" + " credentials file.");
            }
        });
    });
}
function parseKnownFiles(init) {
    var _a = init.loadedConfig, loadedConfig = _a === void 0 ? loadSharedConfigFiles(init) : _a;
    return loadedConfig.then(function (parsedFiles) {
        var configFile = parsedFiles.configFile, credentialsFile = parsedFiles.credentialsFile;
        return __assign(__assign({}, configFile), credentialsFile);
    });
}
function resolveStaticCredentials(profile) {
    return Promise.resolve({
        accessKeyId: profile.aws_access_key_id,
        secretAccessKey: profile.aws_secret_access_key,
        sessionToken: profile.aws_session_token,
    });
}

/**
 * Creates a credential provider that will read from a credential_process specified
 * in ini files.
 */
function fromProcess(init) {
    if (init === void 0) { init = {}; }
    return function () {
        return parseKnownFiles(init).then(function (profiles) { return resolveProcessCredentials(getMasterProfileName(init), profiles); });
    };
}
function resolveProcessCredentials(profileName, profiles, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
options) {
    return __awaiter(this, void 0, void 0, function () {
        var profile, credentialProcess;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    profile = profiles[profileName];
                    if (!profiles[profileName]) return [3 /*break*/, 4];
                    credentialProcess = profile["credential_process"];
                    if (!(credentialProcess !== undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, execPromise(credentialProcess)
                            .then(function (processResult) {
                            var data;
                            try {
                                data = JSON.parse(processResult);
                            }
                            catch (_a) {
                                throw Error("Profile " + profileName + " credential_process returned invalid JSON.");
                            }
                            var version = data.Version, accessKeyId = data.AccessKeyId, secretAccessKey = data.SecretAccessKey, sessionToken = data.SessionToken, expiration = data.Expiration;
                            if (version !== 1) {
                                throw Error("Profile " + profileName + " credential_process did not return Version 1.");
                            }
                            if (accessKeyId === undefined || secretAccessKey === undefined) {
                                throw Error("Profile " + profileName + " credential_process returned invalid credentials.");
                            }
                            var expirationUnix;
                            if (expiration) {
                                var currentTime = new Date();
                                var expireTime = new Date(expiration);
                                if (expireTime < currentTime) {
                                    throw Error("Profile " + profileName + " credential_process returned expired credentials.");
                                }
                                expirationUnix = Math.floor(new Date(expiration).valueOf() / 1000);
                            }
                            return {
                                accessKeyId: accessKeyId,
                                secretAccessKey: secretAccessKey,
                                sessionToken: sessionToken,
                                expirationUnix: expirationUnix,
                            };
                        })
                            .catch(function (error) {
                            throw new ProviderError(error.message);
                        })];
                case 1: return [2 /*return*/, _a.sent()];
                case 2: throw new ProviderError("Profile " + profileName + " did not contain credential_process.");
                case 3: return [3 /*break*/, 5];
                case 4: 
                // If the profile cannot be parsed or does not contain the default or
                // specified profile throw an error. This should be considered a terminal
                // resolution error if a profile has been specified by the user (whether via
                // a parameter, anenvironment variable, or another profile's `source_profile` key).
                throw new ProviderError("Profile " + profileName + " could not be found in shared credentials file.");
                case 5: return [2 /*return*/];
            }
        });
    });
}
function execPromise(command) {
    return new Promise(function (resolve, reject) {
        child_process.exec(command, function (error, stdout) {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

var ENV_IMDS_DISABLED = "AWS_EC2_METADATA_DISABLED";
/**
 * Creates a credential provider that will attempt to find credentials from the
 * following sources (listed in order of precedence):
 *   * Environment variables exposed via `process.env`
 *   * Shared credentials and config ini files
 *   * The EC2/ECS Instance Metadata Service
 *
 * The default credential provider will invoke one provider at a time and only
 * continue to the next if no credentials have been located. For example, if
 * the process finds values defined via the `AWS_ACCESS_KEY_ID` and
 * `AWS_SECRET_ACCESS_KEY` environment variables, the files at
 * `~/.aws/credentials` and `~/.aws/config` will not be read, nor will any
 * messages be sent to the Instance Metadata Service.
 *
 * @param init                  Configuration that is passed to each individual
 *                              provider
 *
 * @see fromEnv                 The function used to source credentials from
 *                              environment variables
 * @see fromIni                 The function used to source credentials from INI
 *                              files
 * @see fromProcess             The functino used to sources credentials from
 *                              credential_process in INI files
 * @see fromInstanceMetadata    The function used to source credentials from the
 *                              EC2 Instance Metadata Service
 * @see fromContainerMetadata   The function used to source credentials from the
 *                              ECS Container Metadata Service
 */
function defaultProvider(init) {
    if (init === void 0) { init = {}; }
    var _a = init.profile, profile = _a === void 0 ? process.env[ENV_PROFILE] : _a;
    var providerChain = profile
        ? fromIni(init)
        : chain(fromEnv(), fromIni(init), fromProcess(init), remoteProvider(init));
    return memoize(providerChain, function (credentials) { return credentials.expiration !== undefined && credentials.expiration.getTime() - Date.now() < 300000; }, function (credentials) { return credentials.expiration !== undefined; });
}
function remoteProvider(init) {
    if (process.env[ENV_CMDS_RELATIVE_URI] || process.env[ENV_CMDS_FULL_URI]) {
        return fromContainerMetadata(init);
    }
    if (process.env[ENV_IMDS_DISABLED]) {
        return function () { return Promise.reject(new ProviderError("EC2 Instance Metadata Service access disabled")); };
    }
    return fromInstanceMetadata(init);
}

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics$1 = function(d, b) {
    extendStatics$1 = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return extendStatics$1(d, b);
};

function __extends$1(d, b) {
    extendStatics$1(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}

var __assign$1 = function() {
    __assign$1 = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign$1.apply(this, arguments);
};

function __rest$1(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}

function __param(paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
}

function __metadata(metadataKey, metadataValue) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}

function __awaiter$1(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator$1(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

function __createBinding(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}

function __exportStar(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) exports[p] = m[p];
}

function __values$1(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __read$1(o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
}

function __spread$1() {
    for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read$1(arguments[i]));
    return ar;
}

function __spreadArrays() {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
}
function __await$1(v) {
    return this instanceof __await$1 ? (this.v = v, this) : new __await$1(v);
}

function __asyncGenerator$1(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await$1 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncDelegator(o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await$1(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
}

function __asyncValues$1(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values$1 === "function" ? __values$1(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

function __makeTemplateObject(cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
}
function __importStar(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result.default = mod;
    return result;
}

function __importDefault(mod) {
    return (mod && mod.__esModule) ? mod : { default: mod };
}

function __classPrivateFieldGet(receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
}

function __classPrivateFieldSet(receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
}

var tslib_es6 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  __extends: __extends$1,
  get __assign () { return __assign$1; },
  __rest: __rest$1,
  __decorate: __decorate,
  __param: __param,
  __metadata: __metadata,
  __awaiter: __awaiter$1,
  __generator: __generator$1,
  __createBinding: __createBinding,
  __exportStar: __exportStar,
  __values: __values$1,
  __read: __read$1,
  __spread: __spread$1,
  __spreadArrays: __spreadArrays,
  __await: __await$1,
  __asyncGenerator: __asyncGenerator$1,
  __asyncDelegator: __asyncDelegator,
  __asyncValues: __asyncValues$1,
  __makeTemplateObject: __makeTemplateObject,
  __importStar: __importStar,
  __importDefault: __importDefault,
  __classPrivateFieldGet: __classPrivateFieldGet,
  __classPrivateFieldSet: __classPrivateFieldSet
});

var build = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });
exports.Crc32 = exports.crc32 = void 0;

function crc32(data) {
    return new Crc32().update(data).digest();
}
exports.crc32 = crc32;
var Crc32 = /** @class */ (function () {
    function Crc32() {
        this.checksum = 0xffffffff;
    }
    Crc32.prototype.update = function (data) {
        var e_1, _a;
        try {
            for (var data_1 = tslib_es6.__values(data), data_1_1 = data_1.next(); !data_1_1.done; data_1_1 = data_1.next()) {
                var byte = data_1_1.value;
                this.checksum =
                    (this.checksum >>> 8) ^ lookupTable[(this.checksum ^ byte) & 0xff];
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (data_1_1 && !data_1_1.done && (_a = data_1.return)) _a.call(data_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return this;
    };
    Crc32.prototype.digest = function () {
        return (this.checksum ^ 0xffffffff) >>> 0;
    };
    return Crc32;
}());
exports.Crc32 = Crc32;
// prettier-ignore
var lookupTable = Uint32Array.from([
    0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA,
    0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3,
    0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988,
    0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91,
    0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE,
    0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7,
    0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC,
    0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5,
    0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172,
    0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B,
    0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940,
    0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59,
    0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116,
    0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F,
    0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924,
    0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D,
    0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A,
    0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433,
    0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818,
    0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01,
    0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E,
    0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457,
    0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C,
    0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65,
    0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2,
    0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB,
    0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0,
    0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9,
    0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086,
    0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F,
    0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4,
    0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD,
    0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A,
    0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683,
    0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8,
    0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1,
    0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE,
    0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7,
    0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC,
    0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5,
    0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252,
    0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B,
    0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60,
    0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79,
    0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236,
    0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F,
    0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04,
    0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D,
    0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A,
    0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713,
    0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38,
    0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21,
    0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E,
    0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777,
    0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C,
    0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45,
    0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2,
    0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB,
    0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0,
    0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9,
    0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6,
    0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF,
    0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94,
    0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D,
]);

});

var SHORT_TO_HEX = {};
var HEX_TO_SHORT = {};
for (var i$1 = 0; i$1 < 256; i$1++) {
    var encodedByte = i$1.toString(16).toLowerCase();
    if (encodedByte.length === 1) {
        encodedByte = "0" + encodedByte;
    }
    SHORT_TO_HEX[i$1] = encodedByte;
    HEX_TO_SHORT[encodedByte] = i$1;
}
/**
 * Converts a hexadecimal encoded string to a Uint8Array of bytes.
 *
 * @param encoded The hexadecimal encoded string
 */
function fromHex(encoded) {
    if (encoded.length % 2 !== 0) {
        throw new Error("Hex encoded strings must have an even number length");
    }
    var out = new Uint8Array(encoded.length / 2);
    for (var i = 0; i < encoded.length; i += 2) {
        var encodedByte = encoded.substr(i, 2).toLowerCase();
        if (encodedByte in HEX_TO_SHORT) {
            out[i / 2] = HEX_TO_SHORT[encodedByte];
        }
        else {
            throw new Error("Cannot decode unrecognized sequence " + encodedByte + " as hexadecimal");
        }
    }
    return out;
}
/**
 * Converts a Uint8Array of binary data to a hexadecimal encoded string.
 *
 * @param bytes The binary data to encode
 */
function toHex(bytes) {
    var out = "";
    for (var i = 0; i < bytes.byteLength; i++) {
        out += SHORT_TO_HEX[bytes[i]];
    }
    return out;
}

/**
 * A lossless representation of a signed, 64-bit integer. Instances of this
 * class may be used in arithmetic expressions as if they were numeric
 * primitives, but the binary representation will be preserved unchanged as the
 * `bytes` property of the object. The bytes should be encoded as big-endian,
 * two's complement integers.
 */
var Int64 = /** @class */ (function () {
    function Int64(bytes) {
        this.bytes = bytes;
        if (bytes.byteLength !== 8) {
            throw new Error("Int64 buffers must be exactly 8 bytes");
        }
    }
    Int64.fromNumber = function (number) {
        if (number > 9223372036854775807 || number < -9223372036854775808) {
            throw new Error(number + " is too large (or, if negative, too small) to represent as an Int64");
        }
        var bytes = new Uint8Array(8);
        for (var i = 7, remaining = Math.abs(Math.round(number)); i > -1 && remaining > 0; i--, remaining /= 256) {
            bytes[i] = remaining;
        }
        if (number < 0) {
            negate(bytes);
        }
        return new Int64(bytes);
    };
    /**
     * Called implicitly by infix arithmetic operators.
     */
    Int64.prototype.valueOf = function () {
        var bytes = this.bytes.slice(0);
        var negative = bytes[0] & 128;
        if (negative) {
            negate(bytes);
        }
        return parseInt(toHex(bytes), 16) * (negative ? -1 : 1);
    };
    Int64.prototype.toString = function () {
        return String(this.valueOf());
    };
    return Int64;
}());
function negate(bytes) {
    for (var i = 0; i < 8; i++) {
        bytes[i] ^= 0xff;
    }
    for (var i = 7; i > -1; i--) {
        bytes[i]++;
        if (bytes[i] !== 0)
            break;
    }
}

/**
 * @internal
 */
var HeaderMarshaller = /** @class */ (function () {
    function HeaderMarshaller(toUtf8, fromUtf8) {
        this.toUtf8 = toUtf8;
        this.fromUtf8 = fromUtf8;
    }
    HeaderMarshaller.prototype.format = function (headers) {
        var e_1, _a, e_2, _b;
        var chunks = [];
        try {
            for (var _c = __values(Object.keys(headers)), _d = _c.next(); !_d.done; _d = _c.next()) {
                var headerName = _d.value;
                var bytes = this.fromUtf8(headerName);
                chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
            }
            finally { if (e_1) throw e_1.error; }
        }
        var out = new Uint8Array(chunks.reduce(function (carry, bytes) { return carry + bytes.byteLength; }, 0));
        var position = 0;
        try {
            for (var chunks_1 = __values(chunks), chunks_1_1 = chunks_1.next(); !chunks_1_1.done; chunks_1_1 = chunks_1.next()) {
                var chunk = chunks_1_1.value;
                out.set(chunk, position);
                position += chunk.byteLength;
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (chunks_1_1 && !chunks_1_1.done && (_b = chunks_1.return)) _b.call(chunks_1);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return out;
    };
    HeaderMarshaller.prototype.formatHeaderValue = function (header) {
        switch (header.type) {
            case "boolean":
                return Uint8Array.from([header.value ? 0 /* boolTrue */ : 1 /* boolFalse */]);
            case "byte":
                return Uint8Array.from([2 /* byte */, header.value]);
            case "short":
                var shortView = new DataView(new ArrayBuffer(3));
                shortView.setUint8(0, 3 /* short */);
                shortView.setInt16(1, header.value, false);
                return new Uint8Array(shortView.buffer);
            case "integer":
                var intView = new DataView(new ArrayBuffer(5));
                intView.setUint8(0, 4 /* integer */);
                intView.setInt32(1, header.value, false);
                return new Uint8Array(intView.buffer);
            case "long":
                var longBytes = new Uint8Array(9);
                longBytes[0] = 5 /* long */;
                longBytes.set(header.value.bytes, 1);
                return longBytes;
            case "binary":
                var binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
                binView.setUint8(0, 6 /* byteArray */);
                binView.setUint16(1, header.value.byteLength, false);
                var binBytes = new Uint8Array(binView.buffer);
                binBytes.set(header.value, 3);
                return binBytes;
            case "string":
                var utf8Bytes = this.fromUtf8(header.value);
                var strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
                strView.setUint8(0, 7 /* string */);
                strView.setUint16(1, utf8Bytes.byteLength, false);
                var strBytes = new Uint8Array(strView.buffer);
                strBytes.set(utf8Bytes, 3);
                return strBytes;
            case "timestamp":
                var tsBytes = new Uint8Array(9);
                tsBytes[0] = 8 /* timestamp */;
                tsBytes.set(Int64.fromNumber(header.value.valueOf()).bytes, 1);
                return tsBytes;
            case "uuid":
                if (!UUID_PATTERN.test(header.value)) {
                    throw new Error("Invalid UUID received: " + header.value);
                }
                var uuidBytes = new Uint8Array(17);
                uuidBytes[0] = 9 /* uuid */;
                uuidBytes.set(fromHex(header.value.replace(/\-/g, "")), 1);
                return uuidBytes;
        }
    };
    HeaderMarshaller.prototype.parse = function (headers) {
        var out = {};
        var position = 0;
        while (position < headers.byteLength) {
            var nameLength = headers.getUint8(position++);
            var name = this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, nameLength));
            position += nameLength;
            switch (headers.getUint8(position++)) {
                case 0 /* boolTrue */:
                    out[name] = {
                        type: BOOLEAN_TAG,
                        value: true,
                    };
                    break;
                case 1 /* boolFalse */:
                    out[name] = {
                        type: BOOLEAN_TAG,
                        value: false,
                    };
                    break;
                case 2 /* byte */:
                    out[name] = {
                        type: BYTE_TAG,
                        value: headers.getInt8(position++),
                    };
                    break;
                case 3 /* short */:
                    out[name] = {
                        type: SHORT_TAG,
                        value: headers.getInt16(position, false),
                    };
                    position += 2;
                    break;
                case 4 /* integer */:
                    out[name] = {
                        type: INT_TAG,
                        value: headers.getInt32(position, false),
                    };
                    position += 4;
                    break;
                case 5 /* long */:
                    out[name] = {
                        type: LONG_TAG,
                        value: new Int64(new Uint8Array(headers.buffer, headers.byteOffset + position, 8)),
                    };
                    position += 8;
                    break;
                case 6 /* byteArray */:
                    var binaryLength = headers.getUint16(position, false);
                    position += 2;
                    out[name] = {
                        type: BINARY_TAG,
                        value: new Uint8Array(headers.buffer, headers.byteOffset + position, binaryLength),
                    };
                    position += binaryLength;
                    break;
                case 7 /* string */:
                    var stringLength = headers.getUint16(position, false);
                    position += 2;
                    out[name] = {
                        type: STRING_TAG,
                        value: this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, stringLength)),
                    };
                    position += stringLength;
                    break;
                case 8 /* timestamp */:
                    out[name] = {
                        type: TIMESTAMP_TAG,
                        value: new Date(new Int64(new Uint8Array(headers.buffer, headers.byteOffset + position, 8)).valueOf()),
                    };
                    position += 8;
                    break;
                case 9 /* uuid */:
                    var uuidBytes = new Uint8Array(headers.buffer, headers.byteOffset + position, 16);
                    position += 16;
                    out[name] = {
                        type: UUID_TAG,
                        value: toHex(uuidBytes.subarray(0, 4)) + "-" + toHex(uuidBytes.subarray(4, 6)) + "-" + toHex(uuidBytes.subarray(6, 8)) + "-" + toHex(uuidBytes.subarray(8, 10)) + "-" + toHex(uuidBytes.subarray(10)),
                    };
                    break;
                default:
                    throw new Error("Unrecognized header type tag");
            }
        }
        return out;
    };
    return HeaderMarshaller;
}());
var HEADER_VALUE_TYPE;
(function (HEADER_VALUE_TYPE) {
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolTrue"] = 0] = "boolTrue";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolFalse"] = 1] = "boolFalse";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byte"] = 2] = "byte";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["short"] = 3] = "short";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["integer"] = 4] = "integer";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["long"] = 5] = "long";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byteArray"] = 6] = "byteArray";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["string"] = 7] = "string";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["timestamp"] = 8] = "timestamp";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["uuid"] = 9] = "uuid";
})(HEADER_VALUE_TYPE || (HEADER_VALUE_TYPE = {}));
var BOOLEAN_TAG = "boolean";
var BYTE_TAG = "byte";
var SHORT_TAG = "short";
var INT_TAG = "integer";
var LONG_TAG = "long";
var BINARY_TAG = "binary";
var STRING_TAG = "string";
var TIMESTAMP_TAG = "timestamp";
var UUID_TAG = "uuid";
var UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

// All prelude components are unsigned, 32-bit integers
var PRELUDE_MEMBER_LENGTH = 4;
// The prelude consists of two components
var PRELUDE_LENGTH = PRELUDE_MEMBER_LENGTH * 2;
// Checksums are always CRC32 hashes.
var CHECKSUM_LENGTH = 4;
// Messages must include a full prelude, a prelude checksum, and a message checksum
var MINIMUM_MESSAGE_LENGTH = PRELUDE_LENGTH + CHECKSUM_LENGTH * 2;
/**
 * @internal
 */
function splitMessage(_a) {
    var byteLength = _a.byteLength, byteOffset = _a.byteOffset, buffer = _a.buffer;
    if (byteLength < MINIMUM_MESSAGE_LENGTH) {
        throw new Error("Provided message too short to accommodate event stream message overhead");
    }
    var view = new DataView(buffer, byteOffset, byteLength);
    var messageLength = view.getUint32(0, false);
    if (byteLength !== messageLength) {
        throw new Error("Reported message length does not match received message length");
    }
    var headerLength = view.getUint32(PRELUDE_MEMBER_LENGTH, false);
    var expectedPreludeChecksum = view.getUint32(PRELUDE_LENGTH, false);
    var expectedMessageChecksum = view.getUint32(byteLength - CHECKSUM_LENGTH, false);
    var checksummer = new build.Crc32().update(new Uint8Array(buffer, byteOffset, PRELUDE_LENGTH));
    if (expectedPreludeChecksum !== checksummer.digest()) {
        throw new Error("The prelude checksum specified in the message (" + expectedPreludeChecksum + ") does not match the calculated CRC32 checksum (" + checksummer.digest() + ")");
    }
    checksummer.update(new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH, byteLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH)));
    if (expectedMessageChecksum !== checksummer.digest()) {
        throw new Error("The message checksum (" + checksummer.digest() + ") did not match the expected value of " + expectedMessageChecksum);
    }
    return {
        headers: new DataView(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH, headerLength),
        body: new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH + headerLength, messageLength - headerLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH + CHECKSUM_LENGTH)),
    };
}

/**
 * A marshaller that can convert binary-packed event stream messages into
 * JavaScript objects and back again into their binary format.
 */
var EventStreamMarshaller = /** @class */ (function () {
    function EventStreamMarshaller(toUtf8, fromUtf8) {
        this.headerMarshaller = new HeaderMarshaller(toUtf8, fromUtf8);
    }
    /**
     * Convert a structured JavaScript object with tagged headers into a binary
     * event stream message.
     */
    EventStreamMarshaller.prototype.marshall = function (_a) {
        var rawHeaders = _a.headers, body = _a.body;
        var headers = this.headerMarshaller.format(rawHeaders);
        var length = headers.byteLength + body.byteLength + 16;
        var out = new Uint8Array(length);
        var view = new DataView(out.buffer, out.byteOffset, out.byteLength);
        var checksum = new build.Crc32();
        // Format message
        view.setUint32(0, length, false);
        view.setUint32(4, headers.byteLength, false);
        view.setUint32(8, checksum.update(out.subarray(0, 8)).digest(), false);
        out.set(headers, 12);
        out.set(body, headers.byteLength + 12);
        // Write trailing message checksum
        view.setUint32(length - 4, checksum.update(out.subarray(8, length - 4)).digest(), false);
        return out;
    };
    /**
     * Convert a binary event stream message into a JavaScript object with an
     * opaque, binary body and tagged, parsed headers.
     */
    EventStreamMarshaller.prototype.unmarshall = function (message) {
        var _a = splitMessage(message), headers = _a.headers, body = _a.body;
        return { headers: this.headerMarshaller.parse(headers), body: body };
    };
    /**
     * Convert a structured JavaScript object with tagged headers into a binary
     * event stream message header.
     */
    EventStreamMarshaller.prototype.formatHeaders = function (rawHeaders) {
        return this.headerMarshaller.format(rawHeaders);
    };
    return EventStreamMarshaller;
}());

function getChunkedStream(source) {
    var _a;
    var currentMessageTotalLength = 0;
    var currentMessagePendingLength = 0;
    var currentMessage = null;
    var messageLengthBuffer = null;
    var allocateMessage = function (size) {
        if (typeof size !== "number") {
            throw new Error("Attempted to allocate an event message where size was not a number: " + size);
        }
        currentMessageTotalLength = size;
        currentMessagePendingLength = 4;
        currentMessage = new Uint8Array(size);
        var currentMessageView = new DataView(currentMessage.buffer);
        currentMessageView.setUint32(0, size, false); //set big-endian Uint32 to 0~3 bytes
    };
    var iterator = function () {
        return __asyncGenerator(this, arguments, function () {
            var sourceIterator, _a, value, done, chunkLength, currentOffset, bytesRemaining, numBytesForTotal, numBytesToWrite;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        sourceIterator = source[Symbol.asyncIterator]();
                        _b.label = 1;
                    case 1:
                        return [4 /*yield*/, __await(sourceIterator.next())];
                    case 2:
                        _a = _b.sent(), value = _a.value, done = _a.done;
                        if (!done) return [3 /*break*/, 10];
                        if (!!currentMessageTotalLength) return [3 /*break*/, 4];
                        return [4 /*yield*/, __await(void 0)];
                    case 3: return [2 /*return*/, _b.sent()];
                    case 4:
                        if (!(currentMessageTotalLength === currentMessagePendingLength)) return [3 /*break*/, 7];
                        return [4 /*yield*/, __await(currentMessage)];
                    case 5: return [4 /*yield*/, _b.sent()];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 8];
                    case 7: throw new Error("Truncated event message received.");
                    case 8: return [4 /*yield*/, __await(void 0)];
                    case 9: return [2 /*return*/, _b.sent()];
                    case 10:
                        chunkLength = value.length;
                        currentOffset = 0;
                        _b.label = 11;
                    case 11:
                        if (!(currentOffset < chunkLength)) return [3 /*break*/, 15];
                        // create new message if necessary
                        if (!currentMessage) {
                            bytesRemaining = chunkLength - currentOffset;
                            // prevent edge case where total length spans 2 chunks
                            if (!messageLengthBuffer) {
                                messageLengthBuffer = new Uint8Array(4);
                            }
                            numBytesForTotal = Math.min(4 - currentMessagePendingLength, // remaining bytes to fill the messageLengthBuffer
                            bytesRemaining // bytes left in chunk
                            );
                            messageLengthBuffer.set(
                            // @ts-ignore error TS2532: Object is possibly 'undefined' for value
                            value.slice(currentOffset, currentOffset + numBytesForTotal), currentMessagePendingLength);
                            currentMessagePendingLength += numBytesForTotal;
                            currentOffset += numBytesForTotal;
                            if (currentMessagePendingLength < 4) {
                                // not enough information to create the current message
                                return [3 /*break*/, 15];
                            }
                            allocateMessage(new DataView(messageLengthBuffer.buffer).getUint32(0, false));
                            messageLengthBuffer = null;
                        }
                        numBytesToWrite = Math.min(currentMessageTotalLength - currentMessagePendingLength, // number of bytes left to complete message
                        chunkLength - currentOffset // number of bytes left in the original chunk
                        );
                        currentMessage.set(
                        // @ts-ignore error TS2532: Object is possibly 'undefined' for value
                        value.slice(currentOffset, currentOffset + numBytesToWrite), currentMessagePendingLength);
                        currentMessagePendingLength += numBytesToWrite;
                        currentOffset += numBytesToWrite;
                        if (!(currentMessageTotalLength && currentMessageTotalLength === currentMessagePendingLength)) return [3 /*break*/, 14];
                        return [4 /*yield*/, __await(currentMessage)];
                    case 12: 
                    // push out the message
                    return [4 /*yield*/, _b.sent()];
                    case 13:
                        // push out the message
                        _b.sent();
                        // cleanup
                        currentMessage = null;
                        currentMessageTotalLength = 0;
                        currentMessagePendingLength = 0;
                        _b.label = 14;
                    case 14: return [3 /*break*/, 11];
                    case 15: return [3 /*break*/, 1];
                    case 16: return [2 /*return*/];
                }
            });
        });
    };
    return _a = {},
        _a[Symbol.asyncIterator] = iterator,
        _a;
}

function getUnmarshalledStream(source, options) {
    var _a;
    return _a = {},
        _a[Symbol.asyncIterator] = function () {
            return __asyncGenerator(this, arguments, function () {
                var source_1, source_1_1, chunk, message, messageType, unmodeledError, code, exception, deserializedException, error, event, deserialized, e_1_1;
                var _a, _b;
                var e_1, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _d.trys.push([0, 12, 13, 18]);
                            source_1 = __asyncValues(source);
                            _d.label = 1;
                        case 1: return [4 /*yield*/, __await(source_1.next())];
                        case 2:
                            if (!(source_1_1 = _d.sent(), !source_1_1.done)) return [3 /*break*/, 11];
                            chunk = source_1_1.value;
                            message = options.eventMarshaller.unmarshall(chunk);
                            messageType = message.headers[":message-type"].value;
                            if (!(messageType === "error")) return [3 /*break*/, 3];
                            unmodeledError = new Error(message.headers[":error-message"].value || "UnknownError");
                            unmodeledError.name = message.headers[":error-code"].value;
                            throw unmodeledError;
                        case 3:
                            if (!(messageType === "exception")) return [3 /*break*/, 5];
                            code = message.headers[":exception-type"].value;
                            exception = (_a = {}, _a[code] = message, _a);
                            return [4 /*yield*/, __await(options.deserializer(exception))];
                        case 4:
                            deserializedException = _d.sent();
                            if (deserializedException.$unknown) {
                                error = new Error(options.toUtf8(message.body));
                                error.name = code;
                                throw error;
                            }
                            throw deserializedException[code];
                        case 5:
                            if (!(messageType === "event")) return [3 /*break*/, 9];
                            event = (_b = {},
                                _b[message.headers[":event-type"].value] = message,
                                _b);
                            return [4 /*yield*/, __await(options.deserializer(event))];
                        case 6:
                            deserialized = _d.sent();
                            if (deserialized.$unknown)
                                return [3 /*break*/, 10];
                            return [4 /*yield*/, __await(deserialized)];
                        case 7: return [4 /*yield*/, _d.sent()];
                        case 8:
                            _d.sent();
                            return [3 /*break*/, 10];
                        case 9: throw Error("Unrecognizable event type: " + message.headers[":event-type"].value);
                        case 10: return [3 /*break*/, 1];
                        case 11: return [3 /*break*/, 18];
                        case 12:
                            e_1_1 = _d.sent();
                            e_1 = { error: e_1_1 };
                            return [3 /*break*/, 18];
                        case 13:
                            _d.trys.push([13, , 16, 17]);
                            if (!(source_1_1 && !source_1_1.done && (_c = source_1.return))) return [3 /*break*/, 15];
                            return [4 /*yield*/, __await(_c.call(source_1))];
                        case 14:
                            _d.sent();
                            _d.label = 15;
                        case 15: return [3 /*break*/, 17];
                        case 16:
                            if (e_1) throw e_1.error;
                            return [7 /*endfinally*/];
                        case 17: return [7 /*endfinally*/];
                        case 18: return [2 /*return*/];
                    }
                });
            });
        },
        _a;
}

var EventStreamMarshaller$1 = /** @class */ (function () {
    function EventStreamMarshaller$1(_a) {
        var utf8Encoder = _a.utf8Encoder, utf8Decoder = _a.utf8Decoder;
        this.eventMarshaller = new EventStreamMarshaller(utf8Encoder, utf8Decoder);
        this.utfEncoder = utf8Encoder;
    }
    EventStreamMarshaller$1.prototype.deserialize = function (body, deserializer) {
        var chunkedStream = getChunkedStream(body);
        var unmarshalledStream = getUnmarshalledStream(chunkedStream, {
            eventMarshaller: this.eventMarshaller,
            deserializer: deserializer,
            toUtf8: this.utfEncoder,
        });
        return unmarshalledStream;
    };
    EventStreamMarshaller$1.prototype.serialize = function (input, serializer) {
        var _a;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        var self = this;
        var serializedIterator = function () {
            return __asyncGenerator(this, arguments, function () {
                var input_1, input_1_1, chunk, payloadBuf, e_1_1;
                var e_1, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 7, 8, 13]);
                            input_1 = __asyncValues(input);
                            _b.label = 1;
                        case 1: return [4 /*yield*/, __await(input_1.next())];
                        case 2:
                            if (!(input_1_1 = _b.sent(), !input_1_1.done)) return [3 /*break*/, 6];
                            chunk = input_1_1.value;
                            payloadBuf = self.eventMarshaller.marshall(serializer(chunk));
                            return [4 /*yield*/, __await(payloadBuf)];
                        case 3: return [4 /*yield*/, _b.sent()];
                        case 4:
                            _b.sent();
                            _b.label = 5;
                        case 5: return [3 /*break*/, 1];
                        case 6: return [3 /*break*/, 13];
                        case 7:
                            e_1_1 = _b.sent();
                            e_1 = { error: e_1_1 };
                            return [3 /*break*/, 13];
                        case 8:
                            _b.trys.push([8, , 11, 12]);
                            if (!(input_1_1 && !input_1_1.done && (_a = input_1.return))) return [3 /*break*/, 10];
                            return [4 /*yield*/, __await(_a.call(input_1))];
                        case 9:
                            _b.sent();
                            _b.label = 10;
                        case 10: return [3 /*break*/, 12];
                        case 11:
                            if (e_1) throw e_1.error;
                            return [7 /*endfinally*/];
                        case 12: return [7 /*endfinally*/];
                        case 13: return [4 /*yield*/, __await(new Uint8Array(0))];
                        case 14: 
                        // Ending frame
                        return [4 /*yield*/, _b.sent()];
                        case 15:
                            // Ending frame
                            _b.sent();
                            return [2 /*return*/];
                    }
                });
            });
        };
        return _a = {},
            _a[Symbol.asyncIterator] = serializedIterator,
            _a;
    };
    return EventStreamMarshaller$1;
}());

/**
 * Convert object stream piped in into an async iterable. This
 * daptor should be deprecated when Node stream iterator is stable.
 * Caveat: this adaptor won't have backpressure to inwards stream
 *
 * Reference: https://nodejs.org/docs/latest-v11.x/api/stream.html#stream_readable_symbol_asynciterator
 */
function readabletoIterable(readStream) {
    return __asyncGenerator(this, arguments, function readabletoIterable_1() {
        var streamEnded, generationEnded, records, value;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    streamEnded = false;
                    generationEnded = false;
                    records = new Array();
                    readStream.on("error", function (err) {
                        if (!streamEnded) {
                            streamEnded = true;
                        }
                        if (err) {
                            throw err;
                        }
                    });
                    readStream.on("data", function (data) {
                        records.push(data);
                    });
                    readStream.on("end", function () {
                        streamEnded = true;
                    });
                    _a.label = 1;
                case 1:
                    if (!!generationEnded) return [3 /*break*/, 6];
                    return [4 /*yield*/, __await(new Promise(function (resolve) { return setTimeout(function () { return resolve(records.shift()); }, 0); }))];
                case 2:
                    value = _a.sent();
                    if (!value) return [3 /*break*/, 5];
                    return [4 /*yield*/, __await(value)];
                case 3: return [4 /*yield*/, _a.sent()];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    generationEnded = streamEnded && records.length === 0;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/];
            }
        });
    });
}

var EventStreamMarshaller$2 = /** @class */ (function () {
    function EventStreamMarshaller$2(_a) {
        var utf8Encoder = _a.utf8Encoder, utf8Decoder = _a.utf8Decoder;
        this.eventMarshaller = new EventStreamMarshaller(utf8Encoder, utf8Decoder);
        this.universalMarshaller = new EventStreamMarshaller$1({
            utf8Decoder: utf8Decoder,
            utf8Encoder: utf8Encoder,
        });
    }
    EventStreamMarshaller$2.prototype.deserialize = function (body, deserializer) {
        //should use stream[Symbol.asyncIterable] when the api is stable
        //reference: https://nodejs.org/docs/latest-v11.x/api/stream.html#stream_readable_symbol_asynciterator
        var bodyIterable = typeof body[Symbol.asyncIterator] === "function" ? body : readabletoIterable(body);
        return this.universalMarshaller.deserialize(bodyIterable, deserializer);
    };
    EventStreamMarshaller$2.prototype.serialize = function (input, serializer) {
        var serializedIterable = this.universalMarshaller.serialize(input, serializer);
        if (typeof Stream.Readable.from === "function") {
            //reference: https://nodejs.org/dist/latest-v13.x/docs/api/stream.html#stream_new_stream_readable_options
            return Stream.Readable.from(serializedIterable);
        }
        else {
            var iterator_1 = serializedIterable[Symbol.asyncIterator]();
            var serializedStream_1 = new Stream.Readable({
                autoDestroy: true,
                objectMode: true,
                read: function () {
                    return __awaiter(this, void 0, void 0, function () {
                        var _this = this;
                        return __generator(this, function (_a) {
                            iterator_1
                                .next()
                                .then(function (_a) {
                                var done = _a.done, value = _a.value;
                                if (done) {
                                    _this.push(null);
                                }
                                else {
                                    _this.push(value);
                                }
                            })
                                .catch(function (err) {
                                _this.destroy(err);
                            });
                            return [2 /*return*/];
                        });
                    });
                },
            });
            //TODO: use 'autoDestroy' when targeting Node 11
            serializedStream_1.on("error", function () {
                serializedStream_1.destroy();
            });
            serializedStream_1.on("end", function () {
                serializedStream_1.destroy();
            });
            return serializedStream_1;
        }
    };
    return EventStreamMarshaller$2;
}());

/** NodeJS event stream utils provider */
var eventStreamSerdeProvider = function (options) { return new EventStreamMarshaller$2(options); };

var isArrayBuffer = function (arg) {
    return (typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer) ||
        Object.prototype.toString.call(arg) === "[object ArrayBuffer]";
};

var fromArrayBuffer = function (input, offset, length) {
    if (offset === void 0) { offset = 0; }
    if (length === void 0) { length = input.byteLength - offset; }
    if (!isArrayBuffer(input)) {
        throw new TypeError("The \"input\" argument must be ArrayBuffer. Received type " + typeof input + " (" + input + ")");
    }
    return buffer$1.Buffer.from(input, offset, length);
};
var fromString = function (input, encoding) {
    if (typeof input !== "string") {
        throw new TypeError("The \"input\" argument must be of type string. Received type " + typeof input + " (" + input + ")");
    }
    return encoding ? buffer$1.Buffer.from(input, encoding) : buffer$1.Buffer.from(input);
};

var Hash = /** @class */ (function () {
    function Hash(algorithmIdentifier, secret) {
        this.hash = secret ? crypto.createHmac(algorithmIdentifier, castSourceData(secret)) : crypto.createHash(algorithmIdentifier);
    }
    Hash.prototype.update = function (toHash, encoding) {
        this.hash.update(castSourceData(toHash, encoding));
    };
    Hash.prototype.digest = function () {
        return Promise.resolve(this.hash.digest());
    };
    return Hash;
}());
function castSourceData(toCast, encoding) {
    if (buffer$1.Buffer.isBuffer(toCast)) {
        return toCast;
    }
    if (typeof toCast === "string") {
        return fromString(toCast, encoding);
    }
    if (ArrayBuffer.isView(toCast)) {
        return fromArrayBuffer(toCast.buffer, toCast.byteOffset, toCast.byteLength);
    }
    return fromArrayBuffer(toCast);
}

var HashCalculator = /** @class */ (function (_super) {
    __extends(HashCalculator, _super);
    function HashCalculator(hash, options) {
        var _this = _super.call(this, options) || this;
        _this.hash = hash;
        return _this;
    }
    HashCalculator.prototype._write = function (chunk, encoding, callback) {
        try {
            this.hash.update(chunk);
        }
        catch (err) {
            return callback(err);
        }
        callback();
    };
    return HashCalculator;
}(Stream.Writable));

var fileStreamHasher = function fileStreamHasher(hashCtor, fileStream) {
    return new Promise(function (resolve, reject) {
        if (!isReadStream(fileStream)) {
            reject(new Error("Unable to calculate hash for non-file streams."));
            return;
        }
        var fileStreamTee = fs.createReadStream(fileStream.path, {
            start: fileStream.start,
            end: fileStream.end,
        });
        var hash = new hashCtor();
        var hashCalculator = new HashCalculator(hash);
        fileStreamTee.pipe(hashCalculator);
        fileStreamTee.on("error", function (err) {
            // if the source errors, the destination stream needs to manually end
            hashCalculator.end();
            reject(err);
        });
        hashCalculator.on("error", reject);
        hashCalculator.on("finish", function () {
            hash.digest().then(resolve).catch(reject);
        });
    });
};
function isReadStream(stream) {
    return typeof stream.path === "string";
}

/**
 * Validate whether a string is an ARN.
 */
var validate$1 = function (str) {
    return typeof str === "string" && str.indexOf("arn:") === 0 && str.split(":").length >= 6;
};
/**
 * Parse an ARN string into structure with partition, service, region, accountId and resource values
 */
var parse$3 = function (arn) {
    var segments = arn.split(":");
    if (segments.length < 6 || segments[0] !== "arn")
        throw new Error("Malformed ARN");
    var _a = __read(segments), 
    //Skip "arn" literal
    partition = _a[1], service = _a[2], region = _a[3], accountId = _a[4], resource = _a.slice(5);
    return {
        partition: partition,
        service: service,
        region: region,
        accountId: accountId,
        resource: resource.join(":"),
    };
};

var DOMAIN_PATTERN = /^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/;
var IP_ADDRESS_PATTERN = /(\d+\.){3}\d+/;
var DOTS_PATTERN = /\.\./;
var DOT_PATTERN = /\./;
var S3_HOSTNAME_PATTERN = /^(.+\.)?s3[.-]([a-z0-9-]+)\./;
var S3_US_EAST_1_ALTNAME_PATTERN = /^s3(-external-1)?\.amazonaws\.com$/;
var AWS_PARTITION_SUFFIX = "amazonaws.com";
var isBucketNameOptions = function (options) { return typeof options.bucketName === "string"; };
/**
 * Get pseudo region from supplied region. For example, if supplied with `fips-us-west-2`, it returns `us-west-2`.
 * @internal
 */
var getPseudoRegion = function (region) { return (isFipsRegion(region) ? region.replace(/fips-|-fips/, "") : region); };
/**
 * Determines whether a given string is DNS compliant per the rules outlined by
 * S3. Length, capitaization, and leading dot restrictions are enforced by the
 * DOMAIN_PATTERN regular expression.
 * @internal
 *
 * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/BucketRestrictions.html
 */
var isDnsCompatibleBucketName = function (bucketName) {
    return DOMAIN_PATTERN.test(bucketName) && !IP_ADDRESS_PATTERN.test(bucketName) && !DOTS_PATTERN.test(bucketName);
};
var getRegionalSuffix = function (hostname) {
    var parts = hostname.match(S3_HOSTNAME_PATTERN);
    return [parts[2], hostname.replace(new RegExp("^" + parts[0]), "")];
};
var getSuffix = function (hostname) {
    return S3_US_EAST_1_ALTNAME_PATTERN.test(hostname) ? ["us-east-1", AWS_PARTITION_SUFFIX] : getRegionalSuffix(hostname);
};
/**
 * Infer region and hostname suffix from a complete hostname
 * @internal
 * @param hostname - Hostname
 * @returns [Region, Hostname suffix]
 */
var getSuffixForArnEndpoint = function (hostname) {
    return S3_US_EAST_1_ALTNAME_PATTERN.test(hostname)
        ? [hostname.replace("." + AWS_PARTITION_SUFFIX, ""), AWS_PARTITION_SUFFIX]
        : getRegionalSuffix(hostname);
};
var validateArnEndpointOptions = function (options) {
    if (options.pathStyleEndpoint) {
        throw new Error("Path-style S3 endpoint is not supported when bucket is an ARN");
    }
    if (options.accelerateEndpoint) {
        throw new Error("Accelerate endpoint is not supported when bucket is an ARN");
    }
    if (!options.tlsCompatible) {
        throw new Error("HTTPS is required when bucket is an ARN");
    }
};
var validateService = function (service) {
    if (service !== "s3" && service !== "s3-outposts") {
        throw new Error("Expect 's3' or 's3-outposts' in ARN service component");
    }
};
var validateS3Service = function (service) {
    if (service !== "s3") {
        throw new Error("Expect 's3' in Accesspoint ARN service component");
    }
};
var validateOutpostService = function (service) {
    if (service !== "s3-outposts") {
        throw new Error("Expect 's3-posts' in Outpost ARN service component");
    }
};
/**
 * Validate partition inferred from ARN is the same to `options.clientPartition`.
 * @internal
 */
var validatePartition = function (partition, options) {
    if (partition !== options.clientPartition) {
        throw new Error("Partition in ARN is incompatible, got \"" + partition + "\" but expected \"" + options.clientPartition + "\"");
    }
};
/**
 * validate region value inferred from ARN. If `options.useArnRegion` is set, it validates the region is not a FIPS
 * region. If `options.useArnRegion` is unset, it validates the region is equal to `options.clientRegion` or
 * `options.clientSigningRegion`.
 * @internal
 */
var validateRegion = function (region, options) {
    if (region === "") {
        throw new Error("ARN region is empty");
    }
    if (!options.useArnRegion &&
        !isEqualRegions(region, options.clientRegion) &&
        !isEqualRegions(region, options.clientSigningRegion)) {
        throw new Error("Region in ARN is incompatible, got " + region + " but expected " + options.clientRegion);
    }
    if (options.useArnRegion && isFipsRegion(region)) {
        throw new Error("Endpoint does not support FIPS region");
    }
};
var isFipsRegion = function (region) { return region.startsWith("fips-") || region.endsWith("-fips"); };
var isEqualRegions = function (regionA, regionB) {
    return regionA === regionB || getPseudoRegion(regionA) === regionB || regionA === getPseudoRegion(regionB);
};
/**
 * Validate an account ID
 * @internal
 */
var validateAccountId = function (accountId) {
    if (!/[0-9]{12}/.exec(accountId)) {
        throw new Error("Access point ARN accountID does not match regex '[0-9]{12}'");
    }
};
/**
 * Validate a host label according to https://tools.ietf.org/html/rfc3986#section-3.2.2
 * @internal
 */
var validateDNSHostLabel = function (label, options) {
    if (options === void 0) { options = { tlsCompatible: true }; }
    // reference: https://tools.ietf.org/html/rfc3986#section-3.2.2
    if (label.length >= 64 ||
        !/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(label) ||
        /(\d+\.){3}\d+/.test(label) ||
        /[.-]{2}/.test(label) ||
        ((options === null || options === void 0 ? void 0 : options.tlsCompatible) && DOT_PATTERN.test(label))) {
        throw new Error("Invalid DNS label " + label);
    }
};
/**
 * Validate and parse an Access Point ARN or Outposts ARN
 * @internal
 *
 * @param resource - The resource section of an ARN
 * @returns Access Point Name and optional Outpost ID.
 */
var getArnResources = function (resource) {
    var delimiter = resource.includes(":") ? ":" : "/";
    var _a = __read(resource.split(delimiter)), resourceType = _a[0], rest = _a.slice(1);
    if (resourceType === "accesspoint") {
        // Parse accesspoint ARN
        if (rest.length !== 1 || rest[0] === "") {
            throw new Error("Access Point ARN should have one resource accesspoint" + delimiter + "{accesspointname}");
        }
        return { accesspointName: rest[0] };
    }
    else if (resourceType === "outpost") {
        // Parse outpost ARN
        if (!rest[0] || rest[1] !== "accesspoint" || !rest[2] || rest.length !== 3) {
            throw new Error("Outpost ARN should have resource outpost" + delimiter + "{outpostId}" + delimiter + "accesspoint" + delimiter + "{accesspointName}");
        }
        var _b = __read(rest, 3), outpostId = _b[0], _ = _b[1], accesspointName = _b[2];
        return { outpostId: outpostId, accesspointName: accesspointName };
    }
    else {
        throw new Error("ARN resource should begin with 'accesspoint" + delimiter + "' or 'outpost" + delimiter + "'");
    }
};
/**
 * Throw if dual stack configuration is set to true.
 * @internal
 */
var validateNoDualstack = function (dualstackEndpoint) {
    if (dualstackEndpoint)
        throw new Error("Dualstack endpoint is not supported with Outpost");
};
/**
 * Validate region is not appended or prepended with a `fips-`
 * @internal
 */
var validateNoFIPS = function (region) {
    if (isFipsRegion(region !== null && region !== void 0 ? region : ""))
        throw new Error("FIPS region is not supported with Outpost, got " + region);
};

var bucketHostname = function (options) {
    var baseHostname = options.baseHostname;
    if (!S3_HOSTNAME_PATTERN.test(baseHostname)) {
        return {
            bucketEndpoint: false,
            hostname: baseHostname,
        };
    }
    return isBucketNameOptions(options)
        ? // Construct endpoint when bucketName is a string referring to a bucket name
            getEndpointFromBucketName(options)
        : // Construct endpoint when bucketName is an ARN referring to an S3 resource like Access Point
            getEndpointFromArn(options);
};
var getEndpointFromArn = function (options) {
    // Infer client region and hostname suffix from hostname from endpoints.json, like `s3.us-west-2.amazonaws.com`
    var _a = __read(getSuffixForArnEndpoint(options.baseHostname), 2), clientRegion = _a[0], hostnameSuffix = _a[1];
    var pathStyleEndpoint = options.pathStyleEndpoint, _b = options.dualstackEndpoint, dualstackEndpoint = _b === void 0 ? false : _b, _c = options.accelerateEndpoint, accelerateEndpoint = _c === void 0 ? false : _c, _d = options.tlsCompatible, tlsCompatible = _d === void 0 ? true : _d, useArnRegion = options.useArnRegion, bucketName = options.bucketName, _e = options.clientPartition, clientPartition = _e === void 0 ? "aws" : _e, _f = options.clientSigningRegion, clientSigningRegion = _f === void 0 ? clientRegion : _f;
    validateArnEndpointOptions({ pathStyleEndpoint: pathStyleEndpoint, accelerateEndpoint: accelerateEndpoint, tlsCompatible: tlsCompatible });
    // Validate and parse the ARN supplied as a bucket name
    var service = bucketName.service, partition = bucketName.partition, accountId = bucketName.accountId, region = bucketName.region, resource = bucketName.resource;
    validateService(service);
    validatePartition(partition, { clientPartition: clientPartition });
    validateAccountId(accountId);
    validateRegion(region, { useArnRegion: useArnRegion, clientRegion: clientRegion, clientSigningRegion: clientSigningRegion });
    var _g = getArnResources(resource), accesspointName = _g.accesspointName, outpostId = _g.outpostId;
    validateDNSHostLabel(accesspointName + "-" + accountId, { tlsCompatible: tlsCompatible });
    var endpointRegion = useArnRegion ? region : clientRegion;
    var signingRegion = useArnRegion ? region : clientSigningRegion;
    if (outpostId) {
        // if this is an Outpost ARN
        validateOutpostService(service);
        validateDNSHostLabel(outpostId, { tlsCompatible: tlsCompatible });
        validateNoDualstack(dualstackEndpoint);
        validateNoFIPS(endpointRegion);
        return {
            bucketEndpoint: true,
            hostname: accesspointName + "-" + accountId + "." + outpostId + ".s3-outposts." + endpointRegion + "." + hostnameSuffix,
            signingRegion: signingRegion,
            signingService: "s3-outposts",
        };
    }
    // construct endpoint from Accesspoint ARN
    validateS3Service(service);
    return {
        bucketEndpoint: true,
        hostname: accesspointName + "-" + accountId + ".s3-accesspoint" + (dualstackEndpoint ? ".dualstack" : "") + "." + endpointRegion + "." + hostnameSuffix,
        signingRegion: signingRegion,
    };
};
var getEndpointFromBucketName = function (_a) {
    var _b = _a.accelerateEndpoint, accelerateEndpoint = _b === void 0 ? false : _b, baseHostname = _a.baseHostname, bucketName = _a.bucketName, _c = _a.dualstackEndpoint, dualstackEndpoint = _c === void 0 ? false : _c, _d = _a.pathStyleEndpoint, pathStyleEndpoint = _d === void 0 ? false : _d, _e = _a.tlsCompatible, tlsCompatible = _e === void 0 ? true : _e;
    var _f = __read(getSuffix(baseHostname), 2), clientRegion = _f[0], hostnameSuffix = _f[1];
    if (pathStyleEndpoint || !isDnsCompatibleBucketName(bucketName) || (tlsCompatible && DOT_PATTERN.test(bucketName))) {
        return {
            bucketEndpoint: false,
            hostname: dualstackEndpoint ? "s3.dualstack." + clientRegion + "." + hostnameSuffix : baseHostname,
        };
    }
    if (accelerateEndpoint) {
        baseHostname = "s3-accelerate" + (dualstackEndpoint ? ".dualstack" : "") + "." + hostnameSuffix;
    }
    else if (dualstackEndpoint) {
        baseHostname = "s3.dualstack." + clientRegion + "." + hostnameSuffix;
    }
    return {
        bucketEndpoint: true,
        hostname: bucketName + "." + baseHostname,
    };
};

var bucketEndpointMiddleware = function (options) { return function (next, context) { return function (args) { return __awaiter(void 0, void 0, void 0, function () {
    var bucketName, replaceBucketInPath, request, bucketArn, clientRegion, _a, _b, partition, _c, signingRegion, useArnRegion, _d, hostname, bucketEndpoint, modifiedSigningRegion, signingService, _e, hostname, bucketEndpoint;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                bucketName = args.input.Bucket;
                replaceBucketInPath = options.bucketEndpoint;
                request = args.request;
                if (!HttpRequest.isInstance(request)) return [3 /*break*/, 7];
                if (!options.bucketEndpoint) return [3 /*break*/, 1];
                request.hostname = bucketName;
                return [3 /*break*/, 6];
            case 1:
                if (!validate$1(bucketName)) return [3 /*break*/, 5];
                bucketArn = parse$3(bucketName);
                _a = getPseudoRegion;
                return [4 /*yield*/, options.region()];
            case 2:
                clientRegion = _a.apply(void 0, [_f.sent()]);
                return [4 /*yield*/, options.regionInfoProvider(clientRegion)];
            case 3:
                _b = (_f.sent()) || {}, partition = _b.partition, _c = _b.signingRegion, signingRegion = _c === void 0 ? clientRegion : _c;
                return [4 /*yield*/, options.useArnRegion()];
            case 4:
                useArnRegion = _f.sent();
                _d = bucketHostname({
                    bucketName: bucketArn,
                    baseHostname: request.hostname,
                    accelerateEndpoint: options.useAccelerateEndpoint,
                    dualstackEndpoint: options.useDualstackEndpoint,
                    pathStyleEndpoint: options.forcePathStyle,
                    tlsCompatible: request.protocol === "https:",
                    useArnRegion: useArnRegion,
                    clientPartition: partition,
                    clientSigningRegion: signingRegion,
                }), hostname = _d.hostname, bucketEndpoint = _d.bucketEndpoint, modifiedSigningRegion = _d.signingRegion, signingService = _d.signingService;
                // If the request needs to use a region or service name inferred from ARN that different from client region, we
                // need to set them in the handler context so the signer will use them
                if (modifiedSigningRegion && modifiedSigningRegion !== signingRegion) {
                    context["signing_region"] = modifiedSigningRegion;
                }
                if (signingService && signingService !== "s3") {
                    context["signing_service"] = signingService;
                }
                request.hostname = hostname;
                replaceBucketInPath = bucketEndpoint;
                return [3 /*break*/, 6];
            case 5:
                _e = bucketHostname({
                    bucketName: bucketName,
                    baseHostname: request.hostname,
                    accelerateEndpoint: options.useAccelerateEndpoint,
                    dualstackEndpoint: options.useDualstackEndpoint,
                    pathStyleEndpoint: options.forcePathStyle,
                    tlsCompatible: request.protocol === "https:",
                }), hostname = _e.hostname, bucketEndpoint = _e.bucketEndpoint;
                request.hostname = hostname;
                replaceBucketInPath = bucketEndpoint;
                _f.label = 6;
            case 6:
                if (replaceBucketInPath) {
                    request.path = request.path.replace(/^(\/)?[^\/]+/, "");
                    if (request.path === "") {
                        request.path = "/";
                    }
                }
                _f.label = 7;
            case 7: return [2 /*return*/, next(__assign(__assign({}, args), { request: request }))];
        }
    });
}); }; }; };
var bucketEndpointMiddlewareOptions = {
    tags: ["BUCKET_ENDPOINT"],
    name: "bucketEndpointMiddleware",
    relation: "before",
    toMiddleware: "hostHeaderMiddleware",
};
var getBucketEndpointPlugin = function (options) { return ({
    applyToStack: function (clientStack) {
        clientStack.addRelativeTo(bucketEndpointMiddleware(options), bucketEndpointMiddlewareOptions);
    },
}); };

function resolveBucketEndpointConfig(input) {
    var _a = input.bucketEndpoint, bucketEndpoint = _a === void 0 ? false : _a, _b = input.forcePathStyle, forcePathStyle = _b === void 0 ? false : _b, _c = input.useAccelerateEndpoint, useAccelerateEndpoint = _c === void 0 ? false : _c, _d = input.useDualstackEndpoint, useDualstackEndpoint = _d === void 0 ? false : _d, _e = input.useArnRegion, useArnRegion = _e === void 0 ? false : _e;
    return __assign(__assign({}, input), { bucketEndpoint: bucketEndpoint,
        forcePathStyle: forcePathStyle,
        useAccelerateEndpoint: useAccelerateEndpoint,
        useDualstackEndpoint: useDualstackEndpoint, useArnRegion: typeof useArnRegion === "function" ? useArnRegion : function () { return Promise.resolve(useArnRegion); } });
}
var NODE_USE_ARN_REGION_ENV_NAME = "AWS_S3_USE_ARN_REGION";
var NODE_USE_ARN_REGION_INI_NAME = "s3_use_arn_region";
/**
 * Config to load useArnRegion from environment variables and shared INI files
 *
 * @api private
 */
var NODE_USE_ARN_REGION_CONFIG_OPTIONS = {
    environmentVariableSelector: function (env) {
        if (!Object.prototype.hasOwnProperty.call(env, NODE_USE_ARN_REGION_ENV_NAME))
            return undefined;
        if (env[NODE_USE_ARN_REGION_ENV_NAME] === "true")
            return true;
        if (env[NODE_USE_ARN_REGION_ENV_NAME] === "false")
            return false;
        throw new Error("Cannot load env " + NODE_USE_ARN_REGION_ENV_NAME + ". Expected \"true\" or \"false\", got " + env[NODE_USE_ARN_REGION_ENV_NAME] + ".");
    },
    configFileSelector: function (profile) {
        if (!Object.prototype.hasOwnProperty.call(profile, NODE_USE_ARN_REGION_INI_NAME))
            return undefined;
        if (profile[NODE_USE_ARN_REGION_INI_NAME] === "true")
            return true;
        if (profile[NODE_USE_ARN_REGION_INI_NAME] === "false")
            return false;
        throw new Error("Cannot load shared config entry " + NODE_USE_ARN_REGION_INI_NAME + ". Expected \"true\" or \"false\", got " + profile[NODE_USE_ARN_REGION_INI_NAME] + ".");
    },
    default: false,
};

/**
 * Get config value given the environment variable name or getter from
 * environment variable.
 */
var fromEnv$1 = function (envVarSelector) { return function () { return __awaiter(void 0, void 0, void 0, function () {
    var config;
    return __generator(this, function (_a) {
        try {
            config = envVarSelector(process.env);
            if (config === undefined) {
                throw new Error();
            }
            return [2 /*return*/, config];
        }
        catch (e) {
            throw new ProviderError(e.message || "Cannot load config from environment variables with getter: " + envVarSelector);
        }
        return [2 /*return*/];
    });
}); }; };

var DEFAULT_PROFILE$1 = "default";
var ENV_PROFILE$1 = "AWS_PROFILE";
/**
 * Get config value from the shared config files with inferred profile name.
 */
var fromSharedConfigFiles = function (configSelector, _a) {
    if (_a === void 0) { _a = {}; }
    var _b = _a.preferredFile, preferredFile = _b === void 0 ? "config" : _b, init = __rest(_a, ["preferredFile"]);
    return function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, loadedConfig, _b, profile, _c, configFile, credentialsFile, profileFromCredentials, profileFromConfig, mergedProfile, configValue;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _a = init.loadedConfig, loadedConfig = _a === void 0 ? loadSharedConfigFiles(init) : _a, _b = init.profile, profile = _b === void 0 ? process.env[ENV_PROFILE$1] || DEFAULT_PROFILE$1 : _b;
                    return [4 /*yield*/, loadedConfig];
                case 1:
                    _c = _d.sent(), configFile = _c.configFile, credentialsFile = _c.credentialsFile;
                    profileFromCredentials = credentialsFile[profile] || {};
                    profileFromConfig = configFile[profile] || {};
                    mergedProfile = preferredFile === "config"
                        ? __assign(__assign({}, profileFromCredentials), profileFromConfig) : __assign(__assign({}, profileFromConfig), profileFromCredentials);
                    try {
                        configValue = configSelector(mergedProfile);
                        if (configValue === undefined) {
                            throw new Error();
                        }
                        return [2 /*return*/, configValue];
                    }
                    catch (e) {
                        throw new ProviderError(e.message || "Cannot load config for profile " + profile + " in SDK configuration files with getter: " + configSelector);
                    }
                    return [2 /*return*/];
            }
        });
    }); };
};

var isFunction$1 = function (func) { return typeof func === "function"; };
var fromStatic$1 = function (defaultValue) {
    return isFunction$1(defaultValue) ? function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
        return [2 /*return*/, defaultValue()];
    }); }); } : fromStatic(defaultValue);
};

var loadConfig = function (_a, configuration) {
    var environmentVariableSelector = _a.environmentVariableSelector, configFileSelector = _a.configFileSelector, defaultValue = _a.default;
    if (configuration === void 0) { configuration = {}; }
    return memoize(chain(fromEnv$1(environmentVariableSelector), fromSharedConfigFiles(configFileSelector, configuration), fromStatic$1(defaultValue)));
};

var escapeUri = function (uri) {
    // AWS percent-encodes some extra non-standard characters in a URI
    return encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
};
var hexEncode = function (c) { return "%" + c.charCodeAt(0).toString(16).toUpperCase(); };

function buildQueryString(query) {
    var e_1, _a;
    var parts = [];
    try {
        for (var _b = __values(Object.keys(query).sort()), _c = _b.next(); !_c.done; _c = _b.next()) {
            var key = _c.value;
            var value = query[key];
            key = escapeUri(key);
            if (Array.isArray(value)) {
                for (var i = 0, iLen = value.length; i < iLen; i++) {
                    parts.push(key + "=" + escapeUri(value[i]));
                }
            }
            else {
                var qsEntry = key;
                if (value || typeof value === "string") {
                    qsEntry += "=" + escapeUri(value);
                }
                parts.push(qsEntry);
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return parts.join("&");
}

var getTransformedHeaders = function (headers) {
    var e_1, _a;
    var transformedHeaders = {};
    try {
        for (var _b = __values(Object.keys(headers)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var name = _c.value;
            var headerValues = headers[name];
            transformedHeaders[name] = Array.isArray(headerValues) ? headerValues.join(",") : headerValues;
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return transformedHeaders;
};

function setConnectionTimeout(request, reject, timeoutInMs) {
    if (timeoutInMs === void 0) { timeoutInMs = 0; }
    if (!timeoutInMs) {
        return;
    }
    request.on("socket", function (socket) {
        var _this = this;
        if (socket.connecting) {
            // Throw a connecting timeout error unless a connection is made within x time
            var timeoutId_1 = setTimeout(function () {
                // abort the request to destroy it
                _this.abort();
                var timeoutError = new Error("Socket timed out without establishing a connection within " + timeoutInMs + " ms");
                timeoutError.name = "TimeoutError";
                reject(timeoutError);
            }, timeoutInMs);
            // if the connection was established, cancel the timeout
            socket.on("connect", function () {
                clearTimeout(timeoutId_1);
            });
        }
    });
}

function setSocketTimeout(request, reject, timeoutInMs) {
    if (timeoutInMs === void 0) { timeoutInMs = 0; }
    request.setTimeout(timeoutInMs, function () {
        // abort the request to destroy it
        this.abort();
        var timeoutError = new Error("Connection timed out after " + timeoutInMs + " ms");
        timeoutError.name = "TimeoutError";
        reject(timeoutError);
    });
}

function writeRequestBody(httpRequest, request) {
    var expect = request.headers["Expect"] || request.headers["expect"];
    if (expect === "100-continue") {
        httpRequest.on("continue", function () {
            writeBody(httpRequest, request.body);
        });
    }
    else {
        writeBody(httpRequest, request.body);
    }
}
function writeBody(httpRequest, body) {
    if (body instanceof Stream.Readable) {
        // pipe automatically handles end
        body.pipe(httpRequest);
    }
    else if (body) {
        httpRequest.end(Buffer.from(body));
    }
    else {
        httpRequest.end();
    }
}

var NodeHttpHandler = /** @class */ (function () {
    function NodeHttpHandler(_a) {
        var _b = _a === void 0 ? {} : _a, connectionTimeout = _b.connectionTimeout, socketTimeout = _b.socketTimeout, httpAgent = _b.httpAgent, httpsAgent = _b.httpsAgent;
        // Node http handler is hard-coded to http/1.1: https://github.com/nodejs/node/blob/ff5664b83b89c55e4ab5d5f60068fb457f1f5872/lib/_http_server.js#L286
        this.metadata = { handlerProtocol: "http/1.1" };
        this.connectionTimeout = connectionTimeout;
        this.socketTimeout = socketTimeout;
        var keepAlive = true;
        this.httpAgent = httpAgent || new http.Agent({ keepAlive: keepAlive });
        this.httpsAgent = httpsAgent || new https.Agent({ keepAlive: keepAlive });
    }
    NodeHttpHandler.prototype.destroy = function () {
        this.httpAgent.destroy();
        this.httpsAgent.destroy();
    };
    NodeHttpHandler.prototype.handle = function (request, _a) {
        var _this = this;
        var abortSignal = _a.abortSignal;
        return new Promise(function (resolve, reject) {
            // if the request was already aborted, prevent doing extra work
            if (abortSignal === null || abortSignal === void 0 ? void 0 : abortSignal.aborted) {
                var abortError = new Error("Request aborted");
                abortError.name = "AbortError";
                reject(abortError);
                return;
            }
            // determine which http(s) client to use
            var isSSL = request.protocol === "https:";
            var queryString = buildQueryString(request.query || {});
            var nodeHttpsOptions = {
                headers: request.headers,
                host: request.hostname,
                method: request.method,
                path: queryString ? request.path + "?" + queryString : request.path,
                port: request.port,
                agent: isSSL ? _this.httpsAgent : _this.httpAgent,
            };
            // create the http request
            var requestFunc = isSSL ? https.request : http.request;
            var req = requestFunc(nodeHttpsOptions, function (res) {
                var httpResponse = new HttpResponse({
                    statusCode: res.statusCode || -1,
                    headers: getTransformedHeaders(res.headers),
                    body: res,
                });
                resolve({ response: httpResponse });
            });
            req.on("error", reject);
            // wire-up any timeout logic
            setConnectionTimeout(req, reject, _this.connectionTimeout);
            setSocketTimeout(req, reject, _this.socketTimeout);
            // wire-up abort logic
            if (abortSignal) {
                abortSignal.onabort = function () {
                    // ensure request is destroyed
                    req.abort();
                    var abortError = new Error("Request aborted");
                    abortError.name = "AbortError";
                    reject(abortError);
                };
            }
            writeRequestBody(req, request);
        });
    };
    return NodeHttpHandler;
}());

var Collector = /** @class */ (function (_super) {
    __extends(Collector, _super);
    function Collector() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.bufferedBytes = [];
        return _this;
    }
    Collector.prototype._write = function (chunk, encoding, callback) {
        this.bufferedBytes.push(chunk);
        callback();
    };
    return Collector;
}(Stream.Writable));

var streamCollector = function (stream) {
    return new Promise(function (resolve, reject) {
        var collector = new Collector();
        stream.pipe(collector);
        stream.on("error", function (err) {
            // if the source errors, the destination stream needs to manually end
            collector.end();
            reject(err);
        });
        collector.on("error", reject);
        collector.on("finish", function () {
            var bytes = new Uint8Array(Buffer.concat(this.bufferedBytes));
            resolve(bytes);
        });
    });
};

function parseQueryString(querystring) {
    var e_1, _a;
    var query = {};
    querystring = querystring.replace(/^\?/, "");
    if (querystring) {
        try {
            for (var _b = __values(querystring.split("&")), _c = _b.next(); !_c.done; _c = _b.next()) {
                var pair = _c.value;
                var _d = __read(pair.split("="), 2), key = _d[0], _e = _d[1], value = _e === void 0 ? null : _e;
                key = decodeURIComponent(key);
                if (value) {
                    value = decodeURIComponent(value);
                }
                if (!(key in query)) {
                    query[key] = value;
                }
                else if (Array.isArray(query[key])) {
                    query[key].push(value);
                }
                else {
                    query[key] = [query[key], value];
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
    }
    return query;
}

var parseUrl = function (url$1) {
    var _a = url.parse(url$1), _b = _a.hostname, hostname = _b === void 0 ? "localhost" : _b, _c = _a.pathname, pathname = _c === void 0 ? "/" : _c, port = _a.port, _d = _a.protocol, protocol = _d === void 0 ? "https:" : _d, search = _a.search;
    var query;
    if (search) {
        query = parseQueryString(search);
    }
    return {
        hostname: hostname,
        port: port ? parseInt(port) : undefined,
        protocol: protocol,
        path: pathname,
        query: query,
    };
};

/**
 * Converts a base-64 encoded string to a Uint8Array of bytes using Node.JS's
 * `buffer` module.
 *
 * @param input The base-64 encoded string
 */
function fromBase64$1(input) {
    var buffer = fromString(input, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
/**
 * Converts a Uint8Array of binary data to a base-64 encoded string using
 * Node.JS's `buffer` module.
 *
 * @param input The binary data to encode
 */
function toBase64$1(input) {
    return fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("base64");
}

function calculateBodyLength(body) {
    if (!body) {
        return 0;
    }
    if (typeof body === "string") {
        return Buffer.from(body).length;
    }
    else if (typeof body.byteLength === "number") {
        // handles Uint8Array, ArrayBuffer, Buffer, and ArrayBufferView
        return body.byteLength;
    }
    else if (typeof body.size === "number") {
        return body.size;
    }
    else if (typeof body.path === "string") {
        // handles fs readable streams
        return fs.lstatSync(body.path).size;
    }
}

function defaultUserAgent(packageName, packageVersion) {
    var engine = process__default['default'].platform + "/" + process__default['default'].version;
    if (process__default['default'].env.AWS_EXECUTION_ENV) {
        engine += " exec-env/" + process__default['default'].env.AWS_EXECUTION_ENV;
    }
    return "aws-sdk-nodejs-v3-" + packageName + "/" + packageVersion + " " + engine;
}

var fromUtf8 = function (input) {
    var buf = fromString(input, "utf8");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};
var toUtf8 = function (input) {
    return fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("utf8");
};

// Partition default templates
const AWS_TEMPLATE = "s3.{region}.amazonaws.com";
const AWS_CN_TEMPLATE = "s3.{region}.amazonaws.com.cn";
const AWS_ISO_TEMPLATE = "s3.{region}.c2s.ic.gov";
const AWS_ISO_B_TEMPLATE = "s3.{region}.sc2s.sgov.gov";
const AWS_US_GOV_TEMPLATE = "s3.{region}.amazonaws.com";
// Partition regions
const AWS_REGIONS = new Set([
    "ap-east-1",
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-south-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ca-central-1",
    "eu-central-1",
    "eu-north-1",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "me-south-1",
    "sa-east-1",
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
]);
const AWS_CN_REGIONS = new Set(["cn-north-1", "cn-northwest-1"]);
const AWS_ISO_REGIONS = new Set(["us-iso-east-1"]);
const AWS_ISO_B_REGIONS = new Set(["us-isob-east-1"]);
const AWS_US_GOV_REGIONS = new Set(["us-gov-east-1", "us-gov-west-1"]);
const defaultRegionInfoProvider = (region, options) => {
    let regionInfo = undefined;
    switch (region) {
        // First, try to match exact region names.
        case "ap-east-1":
            regionInfo = {
                hostname: "s3.ap-east-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "ap-northeast-1":
            regionInfo = {
                hostname: "s3.ap-northeast-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "ap-northeast-2":
            regionInfo = {
                hostname: "s3.ap-northeast-2.amazonaws.com",
                partition: "aws",
            };
            break;
        case "ap-south-1":
            regionInfo = {
                hostname: "s3.ap-south-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "ap-southeast-1":
            regionInfo = {
                hostname: "s3.ap-southeast-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "ap-southeast-2":
            regionInfo = {
                hostname: "s3.ap-southeast-2.amazonaws.com",
                partition: "aws",
            };
            break;
        case "ca-central-1":
            regionInfo = {
                hostname: "s3.ca-central-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "cn-north-1":
            regionInfo = {
                hostname: "s3.cn-north-1.amazonaws.com.cn",
                partition: "aws-cn",
            };
            break;
        case "cn-northwest-1":
            regionInfo = {
                hostname: "s3.cn-northwest-1.amazonaws.com.cn",
                partition: "aws-cn",
            };
            break;
        case "eu-central-1":
            regionInfo = {
                hostname: "s3.eu-central-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "eu-north-1":
            regionInfo = {
                hostname: "s3.eu-north-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "eu-west-1":
            regionInfo = {
                hostname: "s3.eu-west-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "eu-west-2":
            regionInfo = {
                hostname: "s3.eu-west-2.amazonaws.com",
                partition: "aws",
            };
            break;
        case "eu-west-3":
            regionInfo = {
                hostname: "s3.eu-west-3.amazonaws.com",
                partition: "aws",
            };
            break;
        case "fips-us-gov-west-1":
            regionInfo = {
                hostname: "s3-fips-us-gov-west-1.amazonaws.com",
                partition: "aws-us-gov",
                signingRegion: "us-gov-west-1",
            };
            break;
        case "me-south-1":
            regionInfo = {
                hostname: "s3.me-south-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "s3-external-1":
            regionInfo = {
                hostname: "s3-external-1.amazonaws.com",
                partition: "aws",
                signingRegion: "us-east-1",
            };
            break;
        case "sa-east-1":
            regionInfo = {
                hostname: "s3.sa-east-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "us-east-1":
            regionInfo = {
                hostname: "s3.amazonaws.com",
                partition: "aws",
            };
            break;
        case "us-east-2":
            regionInfo = {
                hostname: "s3.us-east-2.amazonaws.com",
                partition: "aws",
            };
            break;
        case "us-gov-east-1":
            regionInfo = {
                hostname: "s3.us-gov-east-1.amazonaws.com",
                partition: "aws-us-gov",
            };
            break;
        case "us-gov-west-1":
            regionInfo = {
                hostname: "s3.us-gov-west-1.amazonaws.com",
                partition: "aws-us-gov",
            };
            break;
        case "us-iso-east-1":
            regionInfo = {
                hostname: "s3.us-iso-east-1.c2s.ic.gov",
                partition: "aws-iso",
            };
            break;
        case "us-isob-east-1":
            regionInfo = {
                hostname: "s3.us-isob-east-1.sc2s.sgov.gov",
                partition: "aws-iso-b",
            };
            break;
        case "us-west-1":
            regionInfo = {
                hostname: "s3.us-west-1.amazonaws.com",
                partition: "aws",
            };
            break;
        case "us-west-2":
            regionInfo = {
                hostname: "s3.us-west-2.amazonaws.com",
                partition: "aws",
            };
            break;
        // Next, try to match partition endpoints.
        default:
            if (AWS_REGIONS.has(region)) {
                regionInfo = {
                    hostname: AWS_TEMPLATE.replace("{region}", region),
                    partition: "aws",
                };
            }
            if (AWS_CN_REGIONS.has(region)) {
                regionInfo = {
                    hostname: AWS_CN_TEMPLATE.replace("{region}", region),
                    partition: "aws-cn",
                };
            }
            if (AWS_ISO_REGIONS.has(region)) {
                regionInfo = {
                    hostname: AWS_ISO_TEMPLATE.replace("{region}", region),
                    partition: "aws-iso",
                };
            }
            if (AWS_ISO_B_REGIONS.has(region)) {
                regionInfo = {
                    hostname: AWS_ISO_B_TEMPLATE.replace("{region}", region),
                    partition: "aws-iso-b",
                };
            }
            if (AWS_US_GOV_REGIONS.has(region)) {
                regionInfo = {
                    hostname: AWS_US_GOV_TEMPLATE.replace("{region}", region),
                    partition: "aws-us-gov",
                };
            }
            // Finally, assume it's an AWS partition endpoint.
            if (regionInfo === undefined) {
                regionInfo = {
                    hostname: AWS_TEMPLATE.replace("{region}", region),
                    partition: "aws",
                };
            }
    }
    return Promise.resolve(regionInfo);
};

const ClientSharedValues = {
    apiVersion: "2006-03-01",
    disableHostPrefix: false,
    logger: {},
    regionInfoProvider: defaultRegionInfoProvider,
    signingEscapePath: false,
    signingName: "s3",
    useArnRegion: false,
};

const ClientDefaultValues = {
    ...ClientSharedValues,
    runtime: "node",
    base64Decoder: fromBase64$1,
    base64Encoder: toBase64$1,
    bodyLengthChecker: calculateBodyLength,
    credentialDefaultProvider: defaultProvider,
    defaultUserAgent: defaultUserAgent(packageInfo.name, packageInfo.version),
    eventStreamSerdeProvider,
    maxAttempts: loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
    md5: Hash.bind(null, "md5"),
    region: loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
    requestHandler: new NodeHttpHandler(),
    sha256: Hash.bind(null, "sha256"),
    streamCollector,
    streamHasher: fileStreamHasher,
    urlParser: parseUrl,
    useArnRegion: loadConfig(NODE_USE_ARN_REGION_CONFIG_OPTIONS),
    utf8Decoder: fromUtf8,
    utf8Encoder: toUtf8,
};

var resolveEventStreamSerdeConfig = function (input) { return (__assign(__assign({}, input), { eventStreamMarshaller: input.eventStreamSerdeProvider(input) })); };

var CONTENT_LENGTH_HEADER = "content-length";
function contentLengthMiddleware(bodyLengthChecker) {
    var _this = this;
    return function (next) { return function (args) { return __awaiter(_this, void 0, void 0, function () {
        var request, body, headers, length;
        var _a;
        return __generator(this, function (_b) {
            request = args.request;
            if (HttpRequest.isInstance(request)) {
                body = request.body, headers = request.headers;
                if (body &&
                    Object.keys(headers)
                        .map(function (str) { return str.toLowerCase(); })
                        .indexOf(CONTENT_LENGTH_HEADER) === -1) {
                    length = bodyLengthChecker(body);
                    if (length !== undefined) {
                        request.headers = __assign(__assign({}, request.headers), (_a = {}, _a[CONTENT_LENGTH_HEADER] = String(length), _a));
                    }
                }
            }
            return [2 /*return*/, next(__assign(__assign({}, args), { request: request }))];
        });
    }); }; };
}
var contentLengthMiddlewareOptions = {
    step: "build",
    tags: ["SET_CONTENT_LENGTH", "CONTENT_LENGTH"],
    name: "contentLengthMiddleware",
};
var getContentLengthPlugin = function (options) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(contentLengthMiddleware(options.bodyLengthChecker), contentLengthMiddlewareOptions);
    },
}); };

function addExpectContinueMiddleware(options) {
    var _this = this;
    return function (next) { return function (args) { return __awaiter(_this, void 0, void 0, function () {
        var request;
        return __generator(this, function (_a) {
            request = args.request;
            if (HttpRequest.isInstance(request) && request.body && options.runtime === "node") {
                request.headers = __assign(__assign({}, request.headers), { Expect: "100-continue" });
            }
            return [2 /*return*/, next(__assign(__assign({}, args), { request: request }))];
        });
    }); }; };
}
var addExpectContinueMiddlewareOptions = {
    step: "build",
    tags: ["SET_EXPECT_HEADER", "EXPECT_HEADER"],
    name: "addExpectContinueMiddleware",
};
var getAddExpectContinuePlugin = function (options) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(addExpectContinueMiddleware(options), addExpectContinueMiddlewareOptions);
    },
}); };

function resolveHostHeaderConfig(input) {
    return input;
}
var hostHeaderMiddleware = function (options) { return function (next) { return function (args) { return __awaiter(void 0, void 0, void 0, function () {
    var request, _a, handlerProtocol;
    return __generator(this, function (_b) {
        if (!HttpRequest.isInstance(args.request))
            return [2 /*return*/, next(args)];
        request = args.request;
        _a = (options.requestHandler.metadata || {}).handlerProtocol, handlerProtocol = _a === void 0 ? "" : _a;
        //For H2 request, remove 'host' header and use ':authority' header instead
        //reference: https://nodejs.org/dist/latest-v13.x/docs/api/errors.html#ERR_HTTP2_INVALID_CONNECTION_HEADERS
        if (handlerProtocol.indexOf("h2") >= 0 && !request.headers[":authority"]) {
            delete request.headers["host"];
            request.headers[":authority"] = "";
            //non-H2 request and 'host' header is not set, set the 'host' header to request's hostname.
        }
        else if (!request.headers["host"]) {
            request.headers["host"] = request.hostname;
        }
        return [2 /*return*/, next(args)];
    });
}); }; }; };
var hostHeaderMiddlewareOptions = {
    name: "hostHeaderMiddleware",
    step: "build",
    priority: "low",
    tags: ["HOST"],
};
var getHostHeaderPlugin = function (options) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(hostHeaderMiddleware(options), hostHeaderMiddlewareOptions);
    },
}); };

var loggerMiddleware = function () { return function (next, context) { return function (args) { return __awaiter(void 0, void 0, void 0, function () {
    var logger, response, $metadata;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                logger = context.logger;
                return [4 /*yield*/, next(args)];
            case 1:
                response = _a.sent();
                if (!logger) {
                    return [2 /*return*/, response];
                }
                $metadata = response.output.$metadata;
                // TODO: Populate custom metadata in https://github.com/aws/aws-sdk-js-v3/issues/1491#issuecomment-692174256
                // $metadata will be removed in https://github.com/aws/aws-sdk-js-v3/issues/1490
                if (typeof logger.info === "function") {
                    logger.info({
                        $metadata: $metadata,
                    });
                }
                return [2 /*return*/, response];
        }
    });
}); }; }; };
var loggerMiddlewareOptions = {
    name: "loggerMiddleware",
    tags: ["LOGGER"],
    step: "build",
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
var getLoggerPlugin = function (options) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(loggerMiddleware(), loggerMiddlewareOptions);
    },
}); };

function validateBucketNameMiddleware() {
    var _this = this;
    return function (next) { return function (args) { return __awaiter(_this, void 0, void 0, function () {
        var Bucket, err;
        return __generator(this, function (_a) {
            Bucket = args.input.Bucket;
            if (typeof Bucket === "string" && !validate$1(Bucket) && Bucket.indexOf("/") >= 0) {
                err = new Error("Bucket name shouldn't contain '/', received '" + Bucket + "'");
                err.name = "InvalidBucketName";
                throw err;
            }
            return [2 /*return*/, next(__assign({}, args))];
        });
    }); }; };
}
var validateBucketNameMiddlewareOptions = {
    step: "initialize",
    tags: ["VALIDATE_BUCKET_NAME"],
    name: "validateBucketNameMiddleware",
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
var getValidateBucketNamePlugin = function (unused) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(validateBucketNameMiddleware(), validateBucketNameMiddlewareOptions);
    },
}); };

var useRegionalEndpointMiddleware = function (config) { return function (next) { return function (args) { return __awaiter(void 0, void 0, void 0, function () {
    var request, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                request = args.request;
                if (!HttpRequest.isInstance(request) || config.isCustomEndpoint)
                    return [2 /*return*/, next(__assign({}, args))];
                if (!(request.hostname === "s3.amazonaws.com")) return [3 /*break*/, 1];
                request.hostname = "s3.us-east-1.amazonaws.com";
                return [3 /*break*/, 3];
            case 1:
                _a = "aws-global";
                return [4 /*yield*/, config.region()];
            case 2:
                if (_a === (_b.sent())) {
                    request.hostname = "s3.amazonaws.com";
                }
                _b.label = 3;
            case 3: return [2 /*return*/, next(__assign({}, args))];
        }
    });
}); }; }; };
var useRegionalEndpointMiddlewareOptions = {
    step: "build",
    tags: ["USE_REGIONAL_ENDPOINT", "S3"],
    name: "useRegionalEndpointMiddleware",
};
var getUseRegionalEndpointPlugin = function (config) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(useRegionalEndpointMiddleware(config), useRegionalEndpointMiddlewareOptions);
    },
}); };

var ALGORITHM_QUERY_PARAM = "X-Amz-Algorithm";
var CREDENTIAL_QUERY_PARAM = "X-Amz-Credential";
var AMZ_DATE_QUERY_PARAM = "X-Amz-Date";
var SIGNED_HEADERS_QUERY_PARAM = "X-Amz-SignedHeaders";
var EXPIRES_QUERY_PARAM = "X-Amz-Expires";
var SIGNATURE_QUERY_PARAM = "X-Amz-Signature";
var TOKEN_QUERY_PARAM = "X-Amz-Security-Token";
var AUTH_HEADER = "authorization";
var AMZ_DATE_HEADER = AMZ_DATE_QUERY_PARAM.toLowerCase();
var DATE_HEADER = "date";
var GENERATED_HEADERS = [AUTH_HEADER, AMZ_DATE_HEADER, DATE_HEADER];
var SIGNATURE_HEADER = SIGNATURE_QUERY_PARAM.toLowerCase();
var SHA256_HEADER = "x-amz-content-sha256";
var TOKEN_HEADER = TOKEN_QUERY_PARAM.toLowerCase();
var ALWAYS_UNSIGNABLE_HEADERS = {
    authorization: true,
    "cache-control": true,
    connection: true,
    expect: true,
    from: true,
    "keep-alive": true,
    "max-forwards": true,
    pragma: true,
    referer: true,
    te: true,
    trailer: true,
    "transfer-encoding": true,
    upgrade: true,
    "user-agent": true,
    "x-amzn-trace-id": true,
};
var PROXY_HEADER_PATTERN = /^proxy-/;
var SEC_HEADER_PATTERN = /^sec-/;
var ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256";
var EVENT_ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256-PAYLOAD";
var UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
var MAX_CACHE_SIZE = 50;
var KEY_TYPE_IDENTIFIER = "aws4_request";
var MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7;

var signingKeyCache = {};
var cacheQueue = [];
/**
 * Create a string describing the scope of credentials used to sign a request.
 *
 * @param shortDate The current calendar date in the form YYYYMMDD.
 * @param region    The AWS region in which the service resides.
 * @param service   The service to which the signed request is being sent.
 */
function createScope(shortDate, region, service) {
    return shortDate + "/" + region + "/" + service + "/" + KEY_TYPE_IDENTIFIER;
}
/**
 * Derive a signing key from its composite parts
 *
 * @param sha256Constructor A constructor function that can instantiate SHA-256
 *                          hash objects.
 * @param credentials       The credentials with which the request will be
 *                          signed.
 * @param shortDate         The current calendar date in the form YYYYMMDD.
 * @param region            The AWS region in which the service resides.
 * @param service           The service to which the signed request is being
 *                          sent.
 */
function getSigningKey(sha256Constructor, credentials, shortDate, region, service) {
    var cacheKey = shortDate + ":" + region + ":" + service + ":" + (credentials.accessKeyId + ":" + credentials.sessionToken);
    if (cacheKey in signingKeyCache) {
        return signingKeyCache[cacheKey];
    }
    cacheQueue.push(cacheKey);
    while (cacheQueue.length > MAX_CACHE_SIZE) {
        delete signingKeyCache[cacheQueue.shift()];
    }
    return (signingKeyCache[cacheKey] = new Promise(function (resolve, reject) {
        var e_1, _a;
        var keyPromise = Promise.resolve("AWS4" + credentials.secretAccessKey);
        var _loop_1 = function (signable) {
            keyPromise = keyPromise.then(function (intermediateKey) { return hmac(sha256Constructor, intermediateKey, signable); });
            keyPromise.catch(function () { });
        };
        try {
            for (var _b = __values([shortDate, region, service, KEY_TYPE_IDENTIFIER]), _c = _b.next(); !_c.done; _c = _b.next()) {
                var signable = _c.value;
                _loop_1(signable);
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        keyPromise.then(resolve, function (reason) {
            delete signingKeyCache[cacheKey];
            reject(reason);
        });
    }));
}
function hmac(ctor, secret, data) {
    var hash = new ctor(secret);
    hash.update(data);
    return hash.digest();
}

/**
 * @internal
 */
function getCanonicalHeaders(_a, unsignableHeaders, signableHeaders) {
    var e_1, _b;
    var headers = _a.headers;
    var canonical = {};
    try {
        for (var _c = __values(Object.keys(headers).sort()), _d = _c.next(); !_d.done; _d = _c.next()) {
            var headerName = _d.value;
            var canonicalHeaderName = headerName.toLowerCase();
            if (canonicalHeaderName in ALWAYS_UNSIGNABLE_HEADERS || (unsignableHeaders === null || unsignableHeaders === void 0 ? void 0 : unsignableHeaders.has(canonicalHeaderName)) ||
                PROXY_HEADER_PATTERN.test(canonicalHeaderName) ||
                SEC_HEADER_PATTERN.test(canonicalHeaderName)) {
                if (!signableHeaders || (signableHeaders && !signableHeaders.has(canonicalHeaderName))) {
                    continue;
                }
            }
            canonical[canonicalHeaderName] = headers[headerName].trim().replace(/\s+/g, " ");
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return canonical;
}

/**
 * @internal
 */
function getCanonicalQuery(_a) {
    var e_1, _b;
    var _c = _a.query, query = _c === void 0 ? {} : _c;
    var keys = [];
    var serialized = {};
    var _loop_1 = function (key) {
        if (key.toLowerCase() === SIGNATURE_HEADER) {
            return "continue";
        }
        keys.push(key);
        var value = query[key];
        if (typeof value === "string") {
            serialized[key] = escapeUri(key) + "=" + escapeUri(value);
        }
        else if (Array.isArray(value)) {
            serialized[key] = value
                .slice(0)
                .sort()
                .reduce(function (encoded, value) { return encoded.concat([escapeUri(key) + "=" + escapeUri(value)]); }, [])
                .join("&");
        }
    };
    try {
        for (var _d = __values(Object.keys(query).sort()), _e = _d.next(); !_e.done; _e = _d.next()) {
            var key = _e.value;
            _loop_1(key);
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_e && !_e.done && (_b = _d.return)) _b.call(_d);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return keys
        .map(function (key) { return serialized[key]; })
        .filter(function (serialized) { return serialized; }) // omit any falsy values
        .join("&");
}

/**
 * @internal
 */
function getPayloadHash(_a, hashConstructor) {
    var headers = _a.headers, body = _a.body;
    return __awaiter(this, void 0, void 0, function () {
        var _b, _c, headerName, hashCtor, _d;
        var e_1, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    try {
                        for (_b = __values(Object.keys(headers)), _c = _b.next(); !_c.done; _c = _b.next()) {
                            headerName = _c.value;
                            if (headerName.toLowerCase() === SHA256_HEADER) {
                                return [2 /*return*/, headers[headerName]];
                            }
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (_c && !_c.done && (_e = _b.return)) _e.call(_b);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    if (!(body == undefined)) return [3 /*break*/, 1];
                    return [2 /*return*/, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"];
                case 1:
                    if (!(typeof body === "string" || ArrayBuffer.isView(body) || isArrayBuffer(body))) return [3 /*break*/, 3];
                    hashCtor = new hashConstructor();
                    hashCtor.update(body);
                    _d = toHex;
                    return [4 /*yield*/, hashCtor.digest()];
                case 2: return [2 /*return*/, _d.apply(void 0, [_f.sent()])];
                case 3: 
                // As any defined body that is not a string or binary data is a stream, this
                // body is unsignable. Attempt to send the request with an unsigned payload,
                // which may or may not be accepted by the service.
                return [2 /*return*/, UNSIGNED_PAYLOAD];
            }
        });
    });
}

function hasHeader(soughtHeader, headers) {
    var e_1, _a;
    soughtHeader = soughtHeader.toLowerCase();
    try {
        for (var _b = __values(Object.keys(headers)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var headerName = _c.value;
            if (soughtHeader === headerName.toLowerCase()) {
                return true;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return false;
}

/**
 * @internal
 */
function cloneRequest(_a) {
    var headers = _a.headers, query = _a.query, rest = __rest(_a, ["headers", "query"]);
    return __assign(__assign({}, rest), { headers: __assign({}, headers), query: query ? cloneQuery$1(query) : undefined });
}
function cloneQuery$1(query) {
    return Object.keys(query).reduce(function (carry, paramName) {
        var _a;
        var param = query[paramName];
        return __assign(__assign({}, carry), (_a = {}, _a[paramName] = Array.isArray(param) ? __spread(param) : param, _a));
    }, {});
}

/**
 * @internal
 */
function moveHeadersToQuery(request) {
    var e_1, _a;
    var _b = typeof request.clone === "function" ? request.clone() : cloneRequest(request), headers = _b.headers, _c = _b.query, query = _c === void 0 ? {} : _c;
    try {
        for (var _d = __values(Object.keys(headers)), _e = _d.next(); !_e.done; _e = _d.next()) {
            var name = _e.value;
            var lname = name.toLowerCase();
            if (lname.substr(0, 6) === "x-amz-") {
                query[name] = headers[name];
                delete headers[name];
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_e && !_e.done && (_a = _d.return)) _a.call(_d);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return __assign(__assign({}, request), { headers: headers,
        query: query });
}

/**
 * @internal
 */
function prepareRequest(request) {
    var e_1, _a;
    // Create a clone of the request object that does not clone the body
    request = typeof request.clone === "function" ? request.clone() : cloneRequest(request);
    try {
        for (var _b = __values(Object.keys(request.headers)), _c = _b.next(); !_c.done; _c = _b.next()) {
            var headerName = _c.value;
            if (GENERATED_HEADERS.indexOf(headerName.toLowerCase()) > -1) {
                delete request.headers[headerName];
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return request;
}

function iso8601(time) {
    return toDate(time)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
}
function toDate(time) {
    if (typeof time === "number") {
        return new Date(time * 1000);
    }
    if (typeof time === "string") {
        if (Number(time)) {
            return new Date(Number(time) * 1000);
        }
        return new Date(time);
    }
    return time;
}

var SignatureV4 = /** @class */ (function () {
    function SignatureV4(_a) {
        var applyChecksum = _a.applyChecksum, credentials = _a.credentials, region = _a.region, service = _a.service, sha256 = _a.sha256, _b = _a.uriEscapePath, uriEscapePath = _b === void 0 ? true : _b;
        this.service = service;
        this.sha256 = sha256;
        this.uriEscapePath = uriEscapePath;
        // default to true if applyChecksum isn't set
        this.applyChecksum = typeof applyChecksum === "boolean" ? applyChecksum : true;
        this.regionProvider = normalizeRegionProvider(region);
        this.credentialProvider = normalizeCredentialsProvider(credentials);
    }
    SignatureV4.prototype.presign = function (originalRequest, options) {
        if (options === void 0) { options = {}; }
        return __awaiter(this, void 0, void 0, function () {
            var _a, signingDate, _b, expiresIn, unsignableHeaders, signableHeaders, signingRegion, signingService, credentials, region, _c, _d, longDate, shortDate, scope, request, canonicalHeaders, _e, _f, _g, _h, _j, _k;
            return __generator(this, function (_l) {
                switch (_l.label) {
                    case 0:
                        _a = options.signingDate, signingDate = _a === void 0 ? new Date() : _a, _b = options.expiresIn, expiresIn = _b === void 0 ? 3600 : _b, unsignableHeaders = options.unsignableHeaders, signableHeaders = options.signableHeaders, signingRegion = options.signingRegion, signingService = options.signingService;
                        return [4 /*yield*/, this.credentialProvider()];
                    case 1:
                        credentials = _l.sent();
                        if (!(signingRegion !== null && signingRegion !== void 0)) return [3 /*break*/, 2];
                        _c = signingRegion;
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.regionProvider()];
                    case 3:
                        _c = (_l.sent());
                        _l.label = 4;
                    case 4:
                        region = _c;
                        _d = formatDate(signingDate), longDate = _d.longDate, shortDate = _d.shortDate;
                        if (expiresIn > MAX_PRESIGNED_TTL) {
                            return [2 /*return*/, Promise.reject("Signature version 4 presigned URLs" + " must have an expiration date less than one week in" + " the future")];
                        }
                        scope = createScope(shortDate, region, signingService !== null && signingService !== void 0 ? signingService : this.service);
                        request = moveHeadersToQuery(prepareRequest(originalRequest));
                        if (credentials.sessionToken) {
                            request.query[TOKEN_QUERY_PARAM] = credentials.sessionToken;
                        }
                        request.query[ALGORITHM_QUERY_PARAM] = ALGORITHM_IDENTIFIER;
                        request.query[CREDENTIAL_QUERY_PARAM] = credentials.accessKeyId + "/" + scope;
                        request.query[AMZ_DATE_QUERY_PARAM] = longDate;
                        request.query[EXPIRES_QUERY_PARAM] = expiresIn.toString(10);
                        canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
                        request.query[SIGNED_HEADERS_QUERY_PARAM] = getCanonicalHeaderList(canonicalHeaders);
                        _e = request.query;
                        _f = SIGNATURE_QUERY_PARAM;
                        _g = this.getSignature;
                        _h = [longDate,
                            scope,
                            this.getSigningKey(credentials, region, shortDate, signingService)];
                        _j = this.createCanonicalRequest;
                        _k = [request, canonicalHeaders];
                        return [4 /*yield*/, getPayloadHash(originalRequest, this.sha256)];
                    case 5: return [4 /*yield*/, _g.apply(this, _h.concat([_j.apply(this, _k.concat([_l.sent()]))]))];
                    case 6:
                        _e[_f] = _l.sent();
                        return [2 /*return*/, request];
                }
            });
        });
    };
    SignatureV4.prototype.sign = function (toSign, options) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (typeof toSign === "string") {
                    return [2 /*return*/, this.signString(toSign, options)];
                }
                else if (toSign.headers && toSign.payload) {
                    return [2 /*return*/, this.signEvent(toSign, options)];
                }
                else {
                    return [2 /*return*/, this.signRequest(toSign, options)];
                }
            });
        });
    };
    SignatureV4.prototype.signEvent = function (_a, _b) {
        var headers = _a.headers, payload = _a.payload;
        var _c = _b.signingDate, signingDate = _c === void 0 ? new Date() : _c, priorSignature = _b.priorSignature, signingRegion = _b.signingRegion, signingService = _b.signingService;
        return __awaiter(this, void 0, void 0, function () {
            var region, _d, _e, shortDate, longDate, scope, hashedPayload, hash, hashedHeaders, _f, stringToSign;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        if (!(signingRegion !== null && signingRegion !== void 0)) return [3 /*break*/, 1];
                        _d = signingRegion;
                        return [3 /*break*/, 3];
                    case 1: return [4 /*yield*/, this.regionProvider()];
                    case 2:
                        _d = (_g.sent());
                        _g.label = 3;
                    case 3:
                        region = _d;
                        _e = formatDate(signingDate), shortDate = _e.shortDate, longDate = _e.longDate;
                        scope = createScope(shortDate, region, signingService !== null && signingService !== void 0 ? signingService : this.service);
                        return [4 /*yield*/, getPayloadHash({ headers: {}, body: payload }, this.sha256)];
                    case 4:
                        hashedPayload = _g.sent();
                        hash = new this.sha256();
                        hash.update(headers);
                        _f = toHex;
                        return [4 /*yield*/, hash.digest()];
                    case 5:
                        hashedHeaders = _f.apply(void 0, [_g.sent()]);
                        stringToSign = [
                            EVENT_ALGORITHM_IDENTIFIER,
                            longDate,
                            scope,
                            priorSignature,
                            hashedHeaders,
                            hashedPayload,
                        ].join("\n");
                        return [2 /*return*/, this.signString(stringToSign, { signingDate: signingDate, signingRegion: region, signingService: signingService })];
                }
            });
        });
    };
    SignatureV4.prototype.signString = function (stringToSign, _a) {
        var _b = _a === void 0 ? {} : _a, _c = _b.signingDate, signingDate = _c === void 0 ? new Date() : _c, signingRegion = _b.signingRegion, signingService = _b.signingService;
        return __awaiter(this, void 0, void 0, function () {
            var credentials, region, _d, shortDate, hash, _e, _f, _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0: return [4 /*yield*/, this.credentialProvider()];
                    case 1:
                        credentials = _h.sent();
                        if (!(signingRegion !== null && signingRegion !== void 0)) return [3 /*break*/, 2];
                        _d = signingRegion;
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.regionProvider()];
                    case 3:
                        _d = (_h.sent());
                        _h.label = 4;
                    case 4:
                        region = _d;
                        shortDate = formatDate(signingDate).shortDate;
                        _f = (_e = this.sha256).bind;
                        return [4 /*yield*/, this.getSigningKey(credentials, region, shortDate, signingService)];
                    case 5:
                        hash = new (_f.apply(_e, [void 0, _h.sent()]))();
                        hash.update(stringToSign);
                        _g = toHex;
                        return [4 /*yield*/, hash.digest()];
                    case 6: return [2 /*return*/, _g.apply(void 0, [_h.sent()])];
                }
            });
        });
    };
    SignatureV4.prototype.signRequest = function (requestToSign, _a) {
        var _b = _a === void 0 ? {} : _a, _c = _b.signingDate, signingDate = _c === void 0 ? new Date() : _c, signableHeaders = _b.signableHeaders, unsignableHeaders = _b.unsignableHeaders, signingRegion = _b.signingRegion, signingService = _b.signingService;
        return __awaiter(this, void 0, void 0, function () {
            var credentials, region, _d, request, _e, longDate, shortDate, scope, payloadHash, canonicalHeaders, signature;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0: return [4 /*yield*/, this.credentialProvider()];
                    case 1:
                        credentials = _f.sent();
                        if (!(signingRegion !== null && signingRegion !== void 0)) return [3 /*break*/, 2];
                        _d = signingRegion;
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, this.regionProvider()];
                    case 3:
                        _d = (_f.sent());
                        _f.label = 4;
                    case 4:
                        region = _d;
                        request = prepareRequest(requestToSign);
                        _e = formatDate(signingDate), longDate = _e.longDate, shortDate = _e.shortDate;
                        scope = createScope(shortDate, region, signingService !== null && signingService !== void 0 ? signingService : this.service);
                        request.headers[AMZ_DATE_HEADER] = longDate;
                        if (credentials.sessionToken) {
                            request.headers[TOKEN_HEADER] = credentials.sessionToken;
                        }
                        return [4 /*yield*/, getPayloadHash(request, this.sha256)];
                    case 5:
                        payloadHash = _f.sent();
                        if (!hasHeader(SHA256_HEADER, request.headers) && this.applyChecksum) {
                            request.headers[SHA256_HEADER] = payloadHash;
                        }
                        canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
                        return [4 /*yield*/, this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, payloadHash))];
                    case 6:
                        signature = _f.sent();
                        request.headers[AUTH_HEADER] =
                            ALGORITHM_IDENTIFIER + " " +
                                ("Credential=" + credentials.accessKeyId + "/" + scope + ", ") +
                                ("SignedHeaders=" + getCanonicalHeaderList(canonicalHeaders) + ", ") +
                                ("Signature=" + signature);
                        return [2 /*return*/, request];
                }
            });
        });
    };
    SignatureV4.prototype.createCanonicalRequest = function (request, canonicalHeaders, payloadHash) {
        var sortedHeaders = Object.keys(canonicalHeaders).sort();
        return request.method + "\n" + this.getCanonicalPath(request) + "\n" + getCanonicalQuery(request) + "\n" + sortedHeaders.map(function (name) { return name + ":" + canonicalHeaders[name]; }).join("\n") + "\n\n" + sortedHeaders.join(";") + "\n" + payloadHash;
    };
    SignatureV4.prototype.createStringToSign = function (longDate, credentialScope, canonicalRequest) {
        return __awaiter(this, void 0, void 0, function () {
            var hash, hashedRequest;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        hash = new this.sha256();
                        hash.update(canonicalRequest);
                        return [4 /*yield*/, hash.digest()];
                    case 1:
                        hashedRequest = _a.sent();
                        return [2 /*return*/, ALGORITHM_IDENTIFIER + "\n" + longDate + "\n" + credentialScope + "\n" + toHex(hashedRequest)];
                }
            });
        });
    };
    SignatureV4.prototype.getCanonicalPath = function (_a) {
        var path = _a.path;
        if (this.uriEscapePath) {
            var doubleEncoded = encodeURIComponent(path.replace(/^\//, ""));
            return "/" + doubleEncoded.replace(/%2F/g, "/");
        }
        return path;
    };
    SignatureV4.prototype.getSignature = function (longDate, credentialScope, keyPromise, canonicalRequest) {
        return __awaiter(this, void 0, void 0, function () {
            var stringToSign, hash, _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, this.createStringToSign(longDate, credentialScope, canonicalRequest)];
                    case 1:
                        stringToSign = _d.sent();
                        _b = (_a = this.sha256).bind;
                        return [4 /*yield*/, keyPromise];
                    case 2:
                        hash = new (_b.apply(_a, [void 0, _d.sent()]))();
                        hash.update(stringToSign);
                        _c = toHex;
                        return [4 /*yield*/, hash.digest()];
                    case 3: return [2 /*return*/, _c.apply(void 0, [_d.sent()])];
                }
            });
        });
    };
    SignatureV4.prototype.getSigningKey = function (credentials, region, shortDate, service) {
        return getSigningKey(this.sha256, credentials, shortDate, region, service || this.service);
    };
    return SignatureV4;
}());
var formatDate = function (now) {
    var longDate = iso8601(now).replace(/[\-:]/g, "");
    return {
        longDate: longDate,
        shortDate: longDate.substr(0, 8),
    };
};
var getCanonicalHeaderList = function (headers) { return Object.keys(headers).sort().join(";"); };
var normalizeRegionProvider = function (region) {
    if (typeof region === "string") {
        var promisified_1 = Promise.resolve(region);
        return function () { return promisified_1; };
    }
    else {
        return region;
    }
};
var normalizeCredentialsProvider = function (credentials) {
    if (typeof credentials === "object") {
        var promisified_2 = Promise.resolve(credentials);
        return function () { return promisified_2; };
    }
    else {
        return credentials;
    }
};

function resolveAwsAuthConfig(input) {
    var _this = this;
    var credentials = input.credentials || input.credentialDefaultProvider(input);
    var normalizedCreds = normalizeProvider(credentials);
    var _a = input.signingEscapePath, signingEscapePath = _a === void 0 ? true : _a, _b = input.systemClockOffset, systemClockOffset = _b === void 0 ? input.systemClockOffset || 0 : _b, sha256 = input.sha256;
    var signer;
    if (input.signer) {
        //if signer is supplied by user, normalize it to a function returning a promise for signer.
        signer = normalizeProvider(input.signer);
    }
    else {
        //construct a provider inferring signing from region.
        signer = function () {
            return normalizeProvider(input.region)()
                .then(function (region) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, input.regionInfoProvider(region)];
                    case 1: return [2 /*return*/, [(_a.sent()) || {}, region]];
                }
            }); }); })
                .then(function (_a) {
                var _b = __read(_a, 2), regionInfo = _b[0], region = _b[1];
                var _c = regionInfo.signingRegion, signingRegion = _c === void 0 ? input.signingRegion : _c, _d = regionInfo.signingService, signingService = _d === void 0 ? input.signingName : _d;
                //update client's singing region and signing service config if they are resolved.
                //signing region resolving order: user supplied signingRegion -> endpoints.json inferred region -> client region
                input.signingRegion = input.signingRegion || signingRegion || region;
                input.signingName = input.signingName || signingService;
                return new SignatureV4({
                    credentials: normalizedCreds,
                    region: input.signingRegion,
                    service: input.signingName,
                    sha256: sha256,
                    uriEscapePath: signingEscapePath,
                });
            });
        };
    }
    return __assign(__assign({}, input), { systemClockOffset: systemClockOffset,
        signingEscapePath: signingEscapePath, credentials: normalizedCreds, signer: signer });
}
function normalizeProvider(input) {
    if (typeof input === "object") {
        var promisified_1 = Promise.resolve(input);
        return function () { return promisified_1; };
    }
    return input;
}

var isClockSkewed = function (newServerTime, systemClockOffset) {
    return Math.abs(getSkewCorrectedDate(systemClockOffset).getTime() - newServerTime) >= 300000;
};
var getSkewCorrectedDate = function (systemClockOffset) { return new Date(Date.now() + systemClockOffset); };
function awsAuthMiddleware(options) {
    return function (next, context) {
        return function (args) {
            return __awaiter(this, void 0, void 0, function () {
                var signer, _a, output, _b, _c, headers, dateHeader, serverTime;
                var _d;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0:
                            if (!HttpRequest.isInstance(args.request))
                                return [2 /*return*/, next(args)];
                            if (!(typeof options.signer === "function")) return [3 /*break*/, 2];
                            return [4 /*yield*/, options.signer()];
                        case 1:
                            _a = _e.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            _a = options.signer;
                            _e.label = 3;
                        case 3:
                            signer = _a;
                            _b = next;
                            _c = [__assign({}, args)];
                            _d = {};
                            return [4 /*yield*/, signer.sign(args.request, {
                                    signingDate: new Date(Date.now() + options.systemClockOffset),
                                    signingRegion: context["signing_region"],
                                    signingService: context["signing_service"],
                                })];
                        case 4: return [4 /*yield*/, _b.apply(void 0, [__assign.apply(void 0, _c.concat([(_d.request = _e.sent(), _d)]))])];
                        case 5:
                            output = _e.sent();
                            headers = output.response.headers;
                            dateHeader = headers && (headers.date || headers.Date);
                            if (dateHeader) {
                                serverTime = Date.parse(dateHeader);
                                if (isClockSkewed(serverTime, options.systemClockOffset)) {
                                    options.systemClockOffset = serverTime - Date.now();
                                }
                            }
                            return [2 /*return*/, output];
                    }
                });
            });
        };
    };
}
var awsAuthMiddlewareOptions = {
    name: "awsAuthMiddleware",
    tags: ["SIGNATURE", "AWSAUTH"],
    relation: "after",
    toMiddleware: "retryMiddleware",
};
var getAwsAuthPlugin = function (options) { return ({
    applyToStack: function (clientStack) {
        clientStack.addRelativeTo(awsAuthMiddleware(options), awsAuthMiddlewareOptions);
    },
}); };

function resolveUserAgentConfig(input) {
    return input;
}

function userAgentMiddleware(options) {
    return function (next) { return function (args) {
        var request = args.request;
        if (!HttpRequest.isInstance(request))
            return next(args);
        var headers = request.headers;
        var userAgentHeader = options.runtime === "node" ? "user-agent" : "x-amz-user-agent";
        if (!headers[userAgentHeader]) {
            headers[userAgentHeader] = "" + options.defaultUserAgent;
        }
        else {
            headers[userAgentHeader] += " " + options.defaultUserAgent;
        }
        if (options.customUserAgent) {
            headers[userAgentHeader] += " " + options.customUserAgent;
        }
        return next(__assign(__assign({}, args), { request: request }));
    }; };
}
var getUserAgentMiddlewareOptions = {
    name: "getUserAgentMiddleware",
    step: "build",
    tags: ["SET_USER_AGENT", "USER_AGENT"],
};
var getUserAgentPlugin = function (config) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(userAgentMiddleware(config), getUserAgentMiddlewareOptions);
    },
}); };

var constructStack = function () {
    var absoluteEntries = [];
    var relativeEntries = [];
    var entriesNameSet = new Set();
    var sort = function (entries) {
        return entries.sort(function (a, b) {
            return stepWeights[b.step] - stepWeights[a.step] ||
                priorityWeights[b.priority || "normal"] - priorityWeights[a.priority || "normal"];
        });
    };
    var removeByName = function (toRemove) {
        var isRemoved = false;
        var filterCb = function (entry) {
            if (entry.name && entry.name === toRemove) {
                isRemoved = true;
                entriesNameSet.delete(toRemove);
                return false;
            }
            return true;
        };
        absoluteEntries = absoluteEntries.filter(filterCb);
        relativeEntries = relativeEntries.filter(filterCb);
        return isRemoved;
    };
    var removeByReference = function (toRemove) {
        var isRemoved = false;
        var filterCb = function (entry) {
            if (entry.middleware === toRemove) {
                isRemoved = true;
                if (entry.name)
                    entriesNameSet.delete(entry.name);
                return false;
            }
            return true;
        };
        absoluteEntries = absoluteEntries.filter(filterCb);
        relativeEntries = relativeEntries.filter(filterCb);
        return isRemoved;
    };
    var cloneTo = function (toStack) {
        absoluteEntries.forEach(function (entry) {
            //@ts-ignore
            toStack.add(entry.middleware, __assign({}, entry));
        });
        relativeEntries.forEach(function (entry) {
            //@ts-ignore
            toStack.addRelativeTo(entry.middleware, __assign({}, entry));
        });
        return toStack;
    };
    var expandRelativeMiddlewareList = function (from) {
        var expandedMiddlewareList = [];
        from.before.forEach(function (entry) {
            if (entry.before.length === 0 && entry.after.length === 0) {
                expandedMiddlewareList.push(entry);
            }
            else {
                expandedMiddlewareList.push.apply(expandedMiddlewareList, __spread(expandRelativeMiddlewareList(entry)));
            }
        });
        expandedMiddlewareList.push(from);
        from.after.reverse().forEach(function (entry) {
            if (entry.before.length === 0 && entry.after.length === 0) {
                expandedMiddlewareList.push(entry);
            }
            else {
                expandedMiddlewareList.push.apply(expandedMiddlewareList, __spread(expandRelativeMiddlewareList(entry)));
            }
        });
        return expandedMiddlewareList;
    };
    /**
     * Get a final list of middleware in the order of being executed in the resolved handler.
     */
    var getMiddlewareList = function () {
        var normalizedAbsoluteEntries = [];
        var normalizedRelativeEntries = [];
        var normalizedEntriesNameMap = {};
        absoluteEntries.forEach(function (entry) {
            var normalizedEntry = __assign(__assign({}, entry), { before: [], after: [] });
            if (normalizedEntry.name)
                normalizedEntriesNameMap[normalizedEntry.name] = normalizedEntry;
            normalizedAbsoluteEntries.push(normalizedEntry);
        });
        relativeEntries.forEach(function (entry) {
            var normalizedEntry = __assign(__assign({}, entry), { before: [], after: [] });
            if (normalizedEntry.name)
                normalizedEntriesNameMap[normalizedEntry.name] = normalizedEntry;
            normalizedRelativeEntries.push(normalizedEntry);
        });
        normalizedRelativeEntries.forEach(function (entry) {
            if (entry.toMiddleware) {
                var toMiddleware = normalizedEntriesNameMap[entry.toMiddleware];
                if (toMiddleware === undefined) {
                    throw new Error(entry.toMiddleware + " is not found when adding " + (entry.name || "anonymous") + " middleware " + entry.relation + " " + entry.toMiddleware);
                }
                if (entry.relation === "after") {
                    toMiddleware.after.push(entry);
                }
                if (entry.relation === "before") {
                    toMiddleware.before.push(entry);
                }
            }
        });
        var mainChain = sort(normalizedAbsoluteEntries)
            .map(expandRelativeMiddlewareList)
            .reduce(function (wholeList, expendedMiddlewareList) {
            // TODO: Replace it with Array.flat();
            wholeList.push.apply(wholeList, __spread(expendedMiddlewareList));
            return wholeList;
        }, []);
        return mainChain.map(function (entry) { return entry.middleware; });
    };
    var stack = {
        add: function (middleware, options) {
            if (options === void 0) { options = {}; }
            var name = options.name;
            var entry = __assign({ step: "initialize", priority: "normal", middleware: middleware }, options);
            if (name) {
                if (entriesNameSet.has(name)) {
                    throw new Error("Duplicate middleware name '" + name + "'");
                }
                entriesNameSet.add(name);
            }
            absoluteEntries.push(entry);
        },
        addRelativeTo: function (middleware, options) {
            var name = options.name;
            var entry = __assign({ middleware: middleware }, options);
            if (name) {
                if (entriesNameSet.has(name)) {
                    throw new Error("Duplicated middleware name '" + name + "'");
                }
                entriesNameSet.add(name);
            }
            relativeEntries.push(entry);
        },
        clone: function () { return cloneTo(constructStack()); },
        use: function (plugin) {
            plugin.applyToStack(stack);
        },
        remove: function (toRemove) {
            if (typeof toRemove === "string")
                return removeByName(toRemove);
            else
                return removeByReference(toRemove);
        },
        removeByTag: function (toRemove) {
            var isRemoved = false;
            var filterCb = function (entry) {
                var tags = entry.tags, name = entry.name;
                if (tags && tags.includes(toRemove)) {
                    if (name)
                        entriesNameSet.delete(name);
                    isRemoved = true;
                    return false;
                }
                return true;
            };
            absoluteEntries = absoluteEntries.filter(filterCb);
            relativeEntries = relativeEntries.filter(filterCb);
            return isRemoved;
        },
        concat: function (from) {
            var cloned = cloneTo(constructStack());
            cloned.use(from);
            return cloned;
        },
        applyToStack: cloneTo,
        resolve: function (handler, context) {
            var e_1, _a;
            try {
                for (var _b = __values(getMiddlewareList().reverse()), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var middleware = _c.value;
                    handler = middleware(handler, context);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return handler;
        },
    };
    return stack;
};
var stepWeights = {
    initialize: 5,
    serialize: 4,
    build: 3,
    finalizeRequest: 2,
    deserialize: 1,
};
var priorityWeights = {
    high: 3,
    normal: 2,
    low: 1,
};

var Client = /** @class */ (function () {
    function Client(config) {
        this.middlewareStack = constructStack();
        this.config = config;
    }
    Client.prototype.send = function (command, optionsOrCb, cb) {
        var options = typeof optionsOrCb !== "function" ? optionsOrCb : undefined;
        var callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        var handler = command.resolveMiddleware(this.middlewareStack, this.config, options);
        if (callback) {
            handler(command)
                .then(function (result) { return callback(null, result.output); }, function (err) { return callback(err); })
                .catch(
            // prevent any errors thrown in the callback from triggering an
            // unhandled promise rejection
            function () { });
        }
        else {
            return handler(command).then(function (result) { return result.output; });
        }
    };
    Client.prototype.destroy = function () {
        if (this.config.requestHandler.destroy)
            this.config.requestHandler.destroy();
    };
    return Client;
}());

var Command = /** @class */ (function () {
    function Command() {
        this.middlewareStack = constructStack();
    }
    return Command;
}());

/**
 * Function that wraps encodeURIComponent to encode additional characters
 * to fully adhere to RFC 3986.
 */
function extendedEncodeURIComponent(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
        return "%" + c.charCodeAt(0).toString(16);
    });
}

/**
 * Recursively parses object and populates value is node from
 * "#text" key if it's available
 */
var getValueFromTextNode = function (obj) {
    var textNodeName = "#text";
    for (var key in obj) {
        if (obj.hasOwnProperty(key) && obj[key][textNodeName] !== undefined) {
            obj[key] = obj[key][textNodeName];
        }
        else if (typeof obj[key] === "object" && obj[key] !== null) {
            obj[key] = getValueFromTextNode(obj[key]);
        }
    }
    return obj;
};

/**
 * Lazy String holder for JSON typed contents.
 */
/**
 * Because of https://github.com/microsoft/tslib/issues/95,
 * TS 'extends' shim doesn't support extending native types like String.
 * So here we create StringWrapper that duplicate everything from String
 * class including its prototype chain. So we can extend from here.
 */
// @ts-ignore StringWrapper implementation is not a simple constructor
var StringWrapper = function () {
    //@ts-ignore 'this' cannot be assigned to any, but Object.getPrototypeOf accepts any
    var Class = Object.getPrototypeOf(this).constructor;
    var Constructor = Function.bind.apply(String, __spread([null], arguments));
    //@ts-ignore Call wrapped String constructor directly, don't bother typing it.
    var instance = new Constructor();
    Object.setPrototypeOf(instance, Class.prototype);
    return instance;
};
StringWrapper.prototype = Object.create(String.prototype, {
    constructor: {
        value: StringWrapper,
        enumerable: false,
        writable: true,
        configurable: true,
    },
});
Object.setPrototypeOf(StringWrapper, String);
var LazyJsonString = /** @class */ (function (_super) {
    __extends(LazyJsonString, _super);
    function LazyJsonString() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    LazyJsonString.prototype.deserializeJSON = function () {
        return JSON.parse(_super.prototype.toString.call(this));
    };
    LazyJsonString.prototype.toJSON = function () {
        return _super.prototype.toString.call(this);
    };
    LazyJsonString.fromObject = function (object) {
        if (object instanceof LazyJsonString) {
            return object;
        }
        else if (object instanceof String || typeof object === "string") {
            return new LazyJsonString(object);
        }
        return new LazyJsonString(JSON.stringify(object));
    };
    return LazyJsonString;
}(StringWrapper));

/**
 * Builds a proper UTC HttpDate timestamp from a Date object
 * since not all environments will have this as the expected
 * format.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toUTCString
 * > Prior to ECMAScript 2018, the format of the return value
 * > varied according to the platform. The most common return
 * > value was an RFC-1123 formatted date stamp, which is a
 * > slightly updated version of RFC-822 date stamps.
 */
// Build indexes outside so we allocate them once.
var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// prettier-ignore
var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateToUtcString(date) {
    var year = date.getUTCFullYear();
    var month = date.getUTCMonth();
    var dayOfWeek = date.getUTCDay();
    var dayOfMonthInt = date.getUTCDate();
    var hoursInt = date.getUTCHours();
    var minutesInt = date.getUTCMinutes();
    var secondsInt = date.getUTCSeconds();
    // Build 0 prefixed strings for contents that need to be
    // two digits and where we get an integer back.
    var dayOfMonthString = dayOfMonthInt < 10 ? "0" + dayOfMonthInt : "" + dayOfMonthInt;
    var hoursString = hoursInt < 10 ? "0" + hoursInt : "" + hoursInt;
    var minutesString = minutesInt < 10 ? "0" + minutesInt : "" + minutesInt;
    var secondsString = secondsInt < 10 ? "0" + secondsInt : "" + secondsInt;
    return days[dayOfWeek] + ", " + dayOfMonthString + " " + months[month] + " " + year + " " + hoursString + ":" + minutesString + ":" + secondsString + " GMT";
}

var SENSITIVE_STRING = "***SensitiveInformation***";

/**
 * <p></p>
 */
class S3Client extends Client {
    constructor(configuration) {
        let _config_0 = {
            ...ClientDefaultValues,
            ...configuration,
        };
        let _config_1 = resolveRegionConfig(_config_0);
        let _config_2 = resolveEndpointsConfig(_config_1);
        let _config_3 = resolveAwsAuthConfig(_config_2);
        let _config_4 = resolveRetryConfig(_config_3);
        let _config_5 = resolveUserAgentConfig(_config_4);
        let _config_6 = resolveBucketEndpointConfig(_config_5);
        let _config_7 = resolveHostHeaderConfig(_config_6);
        let _config_8 = resolveEventStreamSerdeConfig(_config_7);
        super(_config_8);
        this.config = _config_8;
        this.middlewareStack.use(getAwsAuthPlugin(this.config));
        this.middlewareStack.use(getRetryPlugin(this.config));
        this.middlewareStack.use(getUserAgentPlugin(this.config));
        this.middlewareStack.use(getContentLengthPlugin(this.config));
        this.middlewareStack.use(getValidateBucketNamePlugin(this.config));
        this.middlewareStack.use(getUseRegionalEndpointPlugin(this.config));
        this.middlewareStack.use(getAddExpectContinuePlugin(this.config));
        this.middlewareStack.use(getHostHeaderPlugin(this.config));
        this.middlewareStack.use(getLoggerPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

var S3Client$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  S3Client: S3Client
});

var AbortIncompleteMultipartUpload;
(function (AbortIncompleteMultipartUpload) {
    AbortIncompleteMultipartUpload.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AbortIncompleteMultipartUpload || (AbortIncompleteMultipartUpload = {}));
var AbortMultipartUploadOutput;
(function (AbortMultipartUploadOutput) {
    AbortMultipartUploadOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AbortMultipartUploadOutput || (AbortMultipartUploadOutput = {}));
var AbortMultipartUploadRequest;
(function (AbortMultipartUploadRequest) {
    AbortMultipartUploadRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AbortMultipartUploadRequest || (AbortMultipartUploadRequest = {}));
var NoSuchUpload;
(function (NoSuchUpload) {
    NoSuchUpload.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(NoSuchUpload || (NoSuchUpload = {}));
var AccelerateConfiguration;
(function (AccelerateConfiguration) {
    AccelerateConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AccelerateConfiguration || (AccelerateConfiguration = {}));
var Grantee;
(function (Grantee) {
    Grantee.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Grantee || (Grantee = {}));
var Grant;
(function (Grant) {
    Grant.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Grant || (Grant = {}));
var Owner;
(function (Owner) {
    Owner.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Owner || (Owner = {}));
var AccessControlPolicy;
(function (AccessControlPolicy) {
    AccessControlPolicy.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AccessControlPolicy || (AccessControlPolicy = {}));
var AccessControlTranslation;
(function (AccessControlTranslation) {
    AccessControlTranslation.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AccessControlTranslation || (AccessControlTranslation = {}));
var CompleteMultipartUploadOutput;
(function (CompleteMultipartUploadOutput) {
    CompleteMultipartUploadOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(CompleteMultipartUploadOutput || (CompleteMultipartUploadOutput = {}));
var CompletedPart;
(function (CompletedPart) {
    CompletedPart.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CompletedPart || (CompletedPart = {}));
var CompletedMultipartUpload;
(function (CompletedMultipartUpload) {
    CompletedMultipartUpload.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CompletedMultipartUpload || (CompletedMultipartUpload = {}));
var CompleteMultipartUploadRequest;
(function (CompleteMultipartUploadRequest) {
    CompleteMultipartUploadRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CompleteMultipartUploadRequest || (CompleteMultipartUploadRequest = {}));
var CopyObjectResult;
(function (CopyObjectResult) {
    CopyObjectResult.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CopyObjectResult || (CopyObjectResult = {}));
var CopyObjectOutput;
(function (CopyObjectOutput) {
    CopyObjectOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }),
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(CopyObjectOutput || (CopyObjectOutput = {}));
var CopyObjectRequest;
(function (CopyObjectRequest) {
    CopyObjectRequest.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }),
        ...(obj.SSECustomerKey && { SSECustomerKey: SENSITIVE_STRING }),
        ...(obj.CopySourceSSECustomerKey && { CopySourceSSECustomerKey: SENSITIVE_STRING }),
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(CopyObjectRequest || (CopyObjectRequest = {}));
var ObjectNotInActiveTierError;
(function (ObjectNotInActiveTierError) {
    ObjectNotInActiveTierError.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectNotInActiveTierError || (ObjectNotInActiveTierError = {}));
var BucketAlreadyExists;
(function (BucketAlreadyExists) {
    BucketAlreadyExists.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(BucketAlreadyExists || (BucketAlreadyExists = {}));
var BucketAlreadyOwnedByYou;
(function (BucketAlreadyOwnedByYou) {
    BucketAlreadyOwnedByYou.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(BucketAlreadyOwnedByYou || (BucketAlreadyOwnedByYou = {}));
var CreateBucketOutput;
(function (CreateBucketOutput) {
    CreateBucketOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CreateBucketOutput || (CreateBucketOutput = {}));
var CreateBucketConfiguration;
(function (CreateBucketConfiguration) {
    CreateBucketConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CreateBucketConfiguration || (CreateBucketConfiguration = {}));
var CreateBucketRequest;
(function (CreateBucketRequest) {
    CreateBucketRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CreateBucketRequest || (CreateBucketRequest = {}));
var CreateMultipartUploadOutput;
(function (CreateMultipartUploadOutput) {
    CreateMultipartUploadOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }),
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(CreateMultipartUploadOutput || (CreateMultipartUploadOutput = {}));
var CreateMultipartUploadRequest;
(function (CreateMultipartUploadRequest) {
    CreateMultipartUploadRequest.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
        ...(obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }),
        ...(obj.SSECustomerKey && { SSECustomerKey: SENSITIVE_STRING }),
    });
})(CreateMultipartUploadRequest || (CreateMultipartUploadRequest = {}));
var DeleteBucketRequest;
(function (DeleteBucketRequest) {
    DeleteBucketRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketRequest || (DeleteBucketRequest = {}));
var DeleteBucketAnalyticsConfigurationRequest;
(function (DeleteBucketAnalyticsConfigurationRequest) {
    DeleteBucketAnalyticsConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketAnalyticsConfigurationRequest || (DeleteBucketAnalyticsConfigurationRequest = {}));
var DeleteBucketCorsRequest;
(function (DeleteBucketCorsRequest) {
    DeleteBucketCorsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketCorsRequest || (DeleteBucketCorsRequest = {}));
var DeleteBucketEncryptionRequest;
(function (DeleteBucketEncryptionRequest) {
    DeleteBucketEncryptionRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketEncryptionRequest || (DeleteBucketEncryptionRequest = {}));
var DeleteBucketInventoryConfigurationRequest;
(function (DeleteBucketInventoryConfigurationRequest) {
    DeleteBucketInventoryConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketInventoryConfigurationRequest || (DeleteBucketInventoryConfigurationRequest = {}));
var DeleteBucketLifecycleRequest;
(function (DeleteBucketLifecycleRequest) {
    DeleteBucketLifecycleRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketLifecycleRequest || (DeleteBucketLifecycleRequest = {}));
var DeleteBucketMetricsConfigurationRequest;
(function (DeleteBucketMetricsConfigurationRequest) {
    DeleteBucketMetricsConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketMetricsConfigurationRequest || (DeleteBucketMetricsConfigurationRequest = {}));
var DeleteBucketOwnershipControlsRequest;
(function (DeleteBucketOwnershipControlsRequest) {
    DeleteBucketOwnershipControlsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketOwnershipControlsRequest || (DeleteBucketOwnershipControlsRequest = {}));
var DeleteBucketPolicyRequest;
(function (DeleteBucketPolicyRequest) {
    DeleteBucketPolicyRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketPolicyRequest || (DeleteBucketPolicyRequest = {}));
var DeleteBucketReplicationRequest;
(function (DeleteBucketReplicationRequest) {
    DeleteBucketReplicationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketReplicationRequest || (DeleteBucketReplicationRequest = {}));
var DeleteBucketTaggingRequest;
(function (DeleteBucketTaggingRequest) {
    DeleteBucketTaggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketTaggingRequest || (DeleteBucketTaggingRequest = {}));
var DeleteBucketWebsiteRequest;
(function (DeleteBucketWebsiteRequest) {
    DeleteBucketWebsiteRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteBucketWebsiteRequest || (DeleteBucketWebsiteRequest = {}));
var DeleteObjectOutput;
(function (DeleteObjectOutput) {
    DeleteObjectOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteObjectOutput || (DeleteObjectOutput = {}));
var DeleteObjectRequest;
(function (DeleteObjectRequest) {
    DeleteObjectRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteObjectRequest || (DeleteObjectRequest = {}));
var DeletedObject;
(function (DeletedObject) {
    DeletedObject.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeletedObject || (DeletedObject = {}));
var _Error;
(function (_Error) {
    _Error.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(_Error || (_Error = {}));
var DeleteObjectsOutput;
(function (DeleteObjectsOutput) {
    DeleteObjectsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteObjectsOutput || (DeleteObjectsOutput = {}));
var ObjectIdentifier;
(function (ObjectIdentifier) {
    ObjectIdentifier.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectIdentifier || (ObjectIdentifier = {}));
var Delete;
(function (Delete) {
    Delete.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Delete || (Delete = {}));
var DeleteObjectsRequest;
(function (DeleteObjectsRequest) {
    DeleteObjectsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteObjectsRequest || (DeleteObjectsRequest = {}));
var DeleteObjectTaggingOutput;
(function (DeleteObjectTaggingOutput) {
    DeleteObjectTaggingOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteObjectTaggingOutput || (DeleteObjectTaggingOutput = {}));
var DeleteObjectTaggingRequest;
(function (DeleteObjectTaggingRequest) {
    DeleteObjectTaggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteObjectTaggingRequest || (DeleteObjectTaggingRequest = {}));
var DeletePublicAccessBlockRequest;
(function (DeletePublicAccessBlockRequest) {
    DeletePublicAccessBlockRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeletePublicAccessBlockRequest || (DeletePublicAccessBlockRequest = {}));
var GetBucketAccelerateConfigurationOutput;
(function (GetBucketAccelerateConfigurationOutput) {
    GetBucketAccelerateConfigurationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketAccelerateConfigurationOutput || (GetBucketAccelerateConfigurationOutput = {}));
var GetBucketAccelerateConfigurationRequest;
(function (GetBucketAccelerateConfigurationRequest) {
    GetBucketAccelerateConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketAccelerateConfigurationRequest || (GetBucketAccelerateConfigurationRequest = {}));
var GetBucketAclOutput;
(function (GetBucketAclOutput) {
    GetBucketAclOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketAclOutput || (GetBucketAclOutput = {}));
var GetBucketAclRequest;
(function (GetBucketAclRequest) {
    GetBucketAclRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketAclRequest || (GetBucketAclRequest = {}));
var Tag;
(function (Tag) {
    Tag.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Tag || (Tag = {}));
var AnalyticsAndOperator;
(function (AnalyticsAndOperator) {
    AnalyticsAndOperator.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AnalyticsAndOperator || (AnalyticsAndOperator = {}));
var AnalyticsFilter;
(function (AnalyticsFilter) {
    AnalyticsFilter.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AnalyticsFilter || (AnalyticsFilter = {}));
var AnalyticsS3BucketDestination;
(function (AnalyticsS3BucketDestination) {
    AnalyticsS3BucketDestination.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AnalyticsS3BucketDestination || (AnalyticsS3BucketDestination = {}));
var AnalyticsExportDestination;
(function (AnalyticsExportDestination) {
    AnalyticsExportDestination.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AnalyticsExportDestination || (AnalyticsExportDestination = {}));
var StorageClassAnalysisDataExport;
(function (StorageClassAnalysisDataExport) {
    StorageClassAnalysisDataExport.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(StorageClassAnalysisDataExport || (StorageClassAnalysisDataExport = {}));
var StorageClassAnalysis;
(function (StorageClassAnalysis) {
    StorageClassAnalysis.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(StorageClassAnalysis || (StorageClassAnalysis = {}));
var AnalyticsConfiguration;
(function (AnalyticsConfiguration) {
    AnalyticsConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(AnalyticsConfiguration || (AnalyticsConfiguration = {}));
var GetBucketAnalyticsConfigurationOutput;
(function (GetBucketAnalyticsConfigurationOutput) {
    GetBucketAnalyticsConfigurationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketAnalyticsConfigurationOutput || (GetBucketAnalyticsConfigurationOutput = {}));
var GetBucketAnalyticsConfigurationRequest;
(function (GetBucketAnalyticsConfigurationRequest) {
    GetBucketAnalyticsConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketAnalyticsConfigurationRequest || (GetBucketAnalyticsConfigurationRequest = {}));
var CORSRule;
(function (CORSRule) {
    CORSRule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CORSRule || (CORSRule = {}));
var GetBucketCorsOutput;
(function (GetBucketCorsOutput) {
    GetBucketCorsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketCorsOutput || (GetBucketCorsOutput = {}));
var GetBucketCorsRequest;
(function (GetBucketCorsRequest) {
    GetBucketCorsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketCorsRequest || (GetBucketCorsRequest = {}));
var ServerSideEncryptionByDefault;
(function (ServerSideEncryptionByDefault) {
    ServerSideEncryptionByDefault.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.KMSMasterKeyID && { KMSMasterKeyID: SENSITIVE_STRING }),
    });
})(ServerSideEncryptionByDefault || (ServerSideEncryptionByDefault = {}));
var ServerSideEncryptionRule;
(function (ServerSideEncryptionRule) {
    ServerSideEncryptionRule.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.ApplyServerSideEncryptionByDefault && {
            ApplyServerSideEncryptionByDefault: ServerSideEncryptionByDefault.filterSensitiveLog(obj.ApplyServerSideEncryptionByDefault),
        }),
    });
})(ServerSideEncryptionRule || (ServerSideEncryptionRule = {}));
var ServerSideEncryptionConfiguration;
(function (ServerSideEncryptionConfiguration) {
    ServerSideEncryptionConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.Rules && { Rules: obj.Rules.map((item) => ServerSideEncryptionRule.filterSensitiveLog(item)) }),
    });
})(ServerSideEncryptionConfiguration || (ServerSideEncryptionConfiguration = {}));
var GetBucketEncryptionOutput;
(function (GetBucketEncryptionOutput) {
    GetBucketEncryptionOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.ServerSideEncryptionConfiguration && {
            ServerSideEncryptionConfiguration: ServerSideEncryptionConfiguration.filterSensitiveLog(obj.ServerSideEncryptionConfiguration),
        }),
    });
})(GetBucketEncryptionOutput || (GetBucketEncryptionOutput = {}));
var GetBucketEncryptionRequest;
(function (GetBucketEncryptionRequest) {
    GetBucketEncryptionRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketEncryptionRequest || (GetBucketEncryptionRequest = {}));
var SSEKMS;
(function (SSEKMS) {
    SSEKMS.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.KeyId && { KeyId: SENSITIVE_STRING }),
    });
})(SSEKMS || (SSEKMS = {}));
var SSES3;
(function (SSES3) {
    SSES3.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(SSES3 || (SSES3 = {}));
var InventoryEncryption;
(function (InventoryEncryption) {
    InventoryEncryption.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMS && { SSEKMS: SSEKMS.filterSensitiveLog(obj.SSEKMS) }),
    });
})(InventoryEncryption || (InventoryEncryption = {}));
var InventoryS3BucketDestination;
(function (InventoryS3BucketDestination) {
    InventoryS3BucketDestination.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.Encryption && { Encryption: InventoryEncryption.filterSensitiveLog(obj.Encryption) }),
    });
})(InventoryS3BucketDestination || (InventoryS3BucketDestination = {}));
var InventoryDestination;
(function (InventoryDestination) {
    InventoryDestination.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.S3BucketDestination && {
            S3BucketDestination: InventoryS3BucketDestination.filterSensitiveLog(obj.S3BucketDestination),
        }),
    });
})(InventoryDestination || (InventoryDestination = {}));
var InventoryFilter;
(function (InventoryFilter) {
    InventoryFilter.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(InventoryFilter || (InventoryFilter = {}));
var InventorySchedule;
(function (InventorySchedule) {
    InventorySchedule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(InventorySchedule || (InventorySchedule = {}));
var InventoryConfiguration;
(function (InventoryConfiguration) {
    InventoryConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.Destination && { Destination: InventoryDestination.filterSensitiveLog(obj.Destination) }),
    });
})(InventoryConfiguration || (InventoryConfiguration = {}));
var GetBucketInventoryConfigurationOutput;
(function (GetBucketInventoryConfigurationOutput) {
    GetBucketInventoryConfigurationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.InventoryConfiguration && {
            InventoryConfiguration: InventoryConfiguration.filterSensitiveLog(obj.InventoryConfiguration),
        }),
    });
})(GetBucketInventoryConfigurationOutput || (GetBucketInventoryConfigurationOutput = {}));
var GetBucketInventoryConfigurationRequest;
(function (GetBucketInventoryConfigurationRequest) {
    GetBucketInventoryConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketInventoryConfigurationRequest || (GetBucketInventoryConfigurationRequest = {}));
var LifecycleExpiration;
(function (LifecycleExpiration) {
    LifecycleExpiration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(LifecycleExpiration || (LifecycleExpiration = {}));
var LifecycleRuleAndOperator;
(function (LifecycleRuleAndOperator) {
    LifecycleRuleAndOperator.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(LifecycleRuleAndOperator || (LifecycleRuleAndOperator = {}));
var LifecycleRuleFilter;
(function (LifecycleRuleFilter) {
    LifecycleRuleFilter.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(LifecycleRuleFilter || (LifecycleRuleFilter = {}));
var NoncurrentVersionExpiration;
(function (NoncurrentVersionExpiration) {
    NoncurrentVersionExpiration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(NoncurrentVersionExpiration || (NoncurrentVersionExpiration = {}));
var NoncurrentVersionTransition;
(function (NoncurrentVersionTransition) {
    NoncurrentVersionTransition.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(NoncurrentVersionTransition || (NoncurrentVersionTransition = {}));
var Transition;
(function (Transition) {
    Transition.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Transition || (Transition = {}));
var LifecycleRule;
(function (LifecycleRule) {
    LifecycleRule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(LifecycleRule || (LifecycleRule = {}));
var GetBucketLifecycleConfigurationOutput;
(function (GetBucketLifecycleConfigurationOutput) {
    GetBucketLifecycleConfigurationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketLifecycleConfigurationOutput || (GetBucketLifecycleConfigurationOutput = {}));
var GetBucketLifecycleConfigurationRequest;
(function (GetBucketLifecycleConfigurationRequest) {
    GetBucketLifecycleConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketLifecycleConfigurationRequest || (GetBucketLifecycleConfigurationRequest = {}));
var GetBucketLocationOutput;
(function (GetBucketLocationOutput) {
    GetBucketLocationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketLocationOutput || (GetBucketLocationOutput = {}));
var GetBucketLocationRequest;
(function (GetBucketLocationRequest) {
    GetBucketLocationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketLocationRequest || (GetBucketLocationRequest = {}));
var TargetGrant;
(function (TargetGrant) {
    TargetGrant.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(TargetGrant || (TargetGrant = {}));
var LoggingEnabled;
(function (LoggingEnabled) {
    LoggingEnabled.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(LoggingEnabled || (LoggingEnabled = {}));
var GetBucketLoggingOutput;
(function (GetBucketLoggingOutput) {
    GetBucketLoggingOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketLoggingOutput || (GetBucketLoggingOutput = {}));
var GetBucketLoggingRequest;
(function (GetBucketLoggingRequest) {
    GetBucketLoggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketLoggingRequest || (GetBucketLoggingRequest = {}));
var MetricsAndOperator;
(function (MetricsAndOperator) {
    MetricsAndOperator.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(MetricsAndOperator || (MetricsAndOperator = {}));
var MetricsFilter;
(function (MetricsFilter) {
    MetricsFilter.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(MetricsFilter || (MetricsFilter = {}));
var MetricsConfiguration;
(function (MetricsConfiguration) {
    MetricsConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(MetricsConfiguration || (MetricsConfiguration = {}));
var GetBucketMetricsConfigurationOutput;
(function (GetBucketMetricsConfigurationOutput) {
    GetBucketMetricsConfigurationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketMetricsConfigurationOutput || (GetBucketMetricsConfigurationOutput = {}));
var GetBucketMetricsConfigurationRequest;
(function (GetBucketMetricsConfigurationRequest) {
    GetBucketMetricsConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketMetricsConfigurationRequest || (GetBucketMetricsConfigurationRequest = {}));
var GetBucketNotificationConfigurationRequest;
(function (GetBucketNotificationConfigurationRequest) {
    GetBucketNotificationConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketNotificationConfigurationRequest || (GetBucketNotificationConfigurationRequest = {}));
var FilterRule;
(function (FilterRule) {
    FilterRule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(FilterRule || (FilterRule = {}));
var S3KeyFilter;
(function (S3KeyFilter) {
    S3KeyFilter.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(S3KeyFilter || (S3KeyFilter = {}));
var NotificationConfigurationFilter;
(function (NotificationConfigurationFilter) {
    NotificationConfigurationFilter.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(NotificationConfigurationFilter || (NotificationConfigurationFilter = {}));
var LambdaFunctionConfiguration;
(function (LambdaFunctionConfiguration) {
    LambdaFunctionConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(LambdaFunctionConfiguration || (LambdaFunctionConfiguration = {}));
var QueueConfiguration;
(function (QueueConfiguration) {
    QueueConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(QueueConfiguration || (QueueConfiguration = {}));
var TopicConfiguration;
(function (TopicConfiguration) {
    TopicConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(TopicConfiguration || (TopicConfiguration = {}));
var NotificationConfiguration;
(function (NotificationConfiguration) {
    NotificationConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(NotificationConfiguration || (NotificationConfiguration = {}));
var OwnershipControlsRule;
(function (OwnershipControlsRule) {
    OwnershipControlsRule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(OwnershipControlsRule || (OwnershipControlsRule = {}));
var OwnershipControls;
(function (OwnershipControls) {
    OwnershipControls.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(OwnershipControls || (OwnershipControls = {}));
var GetBucketOwnershipControlsOutput;
(function (GetBucketOwnershipControlsOutput) {
    GetBucketOwnershipControlsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketOwnershipControlsOutput || (GetBucketOwnershipControlsOutput = {}));
var GetBucketOwnershipControlsRequest;
(function (GetBucketOwnershipControlsRequest) {
    GetBucketOwnershipControlsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketOwnershipControlsRequest || (GetBucketOwnershipControlsRequest = {}));
var GetBucketPolicyOutput;
(function (GetBucketPolicyOutput) {
    GetBucketPolicyOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketPolicyOutput || (GetBucketPolicyOutput = {}));
var GetBucketPolicyRequest;
(function (GetBucketPolicyRequest) {
    GetBucketPolicyRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketPolicyRequest || (GetBucketPolicyRequest = {}));
var PolicyStatus;
(function (PolicyStatus) {
    PolicyStatus.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PolicyStatus || (PolicyStatus = {}));
var GetBucketPolicyStatusOutput;
(function (GetBucketPolicyStatusOutput) {
    GetBucketPolicyStatusOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketPolicyStatusOutput || (GetBucketPolicyStatusOutput = {}));
var GetBucketPolicyStatusRequest;
(function (GetBucketPolicyStatusRequest) {
    GetBucketPolicyStatusRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketPolicyStatusRequest || (GetBucketPolicyStatusRequest = {}));
var DeleteMarkerReplication;
(function (DeleteMarkerReplication) {
    DeleteMarkerReplication.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteMarkerReplication || (DeleteMarkerReplication = {}));
var EncryptionConfiguration;
(function (EncryptionConfiguration) {
    EncryptionConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(EncryptionConfiguration || (EncryptionConfiguration = {}));
var ReplicationTimeValue;
(function (ReplicationTimeValue) {
    ReplicationTimeValue.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ReplicationTimeValue || (ReplicationTimeValue = {}));
var Metrics;
(function (Metrics) {
    Metrics.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Metrics || (Metrics = {}));
var ReplicationTime;
(function (ReplicationTime) {
    ReplicationTime.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ReplicationTime || (ReplicationTime = {}));
var Destination;
(function (Destination) {
    Destination.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Destination || (Destination = {}));
var ExistingObjectReplication;
(function (ExistingObjectReplication) {
    ExistingObjectReplication.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ExistingObjectReplication || (ExistingObjectReplication = {}));
var ReplicationRuleAndOperator;
(function (ReplicationRuleAndOperator) {
    ReplicationRuleAndOperator.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ReplicationRuleAndOperator || (ReplicationRuleAndOperator = {}));
var ReplicationRuleFilter;
(function (ReplicationRuleFilter) {
    ReplicationRuleFilter.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ReplicationRuleFilter || (ReplicationRuleFilter = {}));
var SseKmsEncryptedObjects;
(function (SseKmsEncryptedObjects) {
    SseKmsEncryptedObjects.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(SseKmsEncryptedObjects || (SseKmsEncryptedObjects = {}));
var SourceSelectionCriteria;
(function (SourceSelectionCriteria) {
    SourceSelectionCriteria.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(SourceSelectionCriteria || (SourceSelectionCriteria = {}));
var ReplicationRule;
(function (ReplicationRule) {
    ReplicationRule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ReplicationRule || (ReplicationRule = {}));
var ReplicationConfiguration;
(function (ReplicationConfiguration) {
    ReplicationConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ReplicationConfiguration || (ReplicationConfiguration = {}));
var GetBucketReplicationOutput;
(function (GetBucketReplicationOutput) {
    GetBucketReplicationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketReplicationOutput || (GetBucketReplicationOutput = {}));
var GetBucketReplicationRequest;
(function (GetBucketReplicationRequest) {
    GetBucketReplicationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketReplicationRequest || (GetBucketReplicationRequest = {}));
var GetBucketRequestPaymentOutput;
(function (GetBucketRequestPaymentOutput) {
    GetBucketRequestPaymentOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketRequestPaymentOutput || (GetBucketRequestPaymentOutput = {}));
var GetBucketRequestPaymentRequest;
(function (GetBucketRequestPaymentRequest) {
    GetBucketRequestPaymentRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketRequestPaymentRequest || (GetBucketRequestPaymentRequest = {}));
var GetBucketTaggingOutput;
(function (GetBucketTaggingOutput) {
    GetBucketTaggingOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketTaggingOutput || (GetBucketTaggingOutput = {}));
var GetBucketTaggingRequest;
(function (GetBucketTaggingRequest) {
    GetBucketTaggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketTaggingRequest || (GetBucketTaggingRequest = {}));
var GetBucketVersioningOutput;
(function (GetBucketVersioningOutput) {
    GetBucketVersioningOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketVersioningOutput || (GetBucketVersioningOutput = {}));
var GetBucketVersioningRequest;
(function (GetBucketVersioningRequest) {
    GetBucketVersioningRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketVersioningRequest || (GetBucketVersioningRequest = {}));
var ErrorDocument;
(function (ErrorDocument) {
    ErrorDocument.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ErrorDocument || (ErrorDocument = {}));
var IndexDocument;
(function (IndexDocument) {
    IndexDocument.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(IndexDocument || (IndexDocument = {}));
var RedirectAllRequestsTo;
(function (RedirectAllRequestsTo) {
    RedirectAllRequestsTo.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(RedirectAllRequestsTo || (RedirectAllRequestsTo = {}));
var Condition;
(function (Condition) {
    Condition.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Condition || (Condition = {}));
var Redirect;
(function (Redirect) {
    Redirect.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Redirect || (Redirect = {}));
var RoutingRule;
(function (RoutingRule) {
    RoutingRule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(RoutingRule || (RoutingRule = {}));
var GetBucketWebsiteOutput;
(function (GetBucketWebsiteOutput) {
    GetBucketWebsiteOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketWebsiteOutput || (GetBucketWebsiteOutput = {}));
var GetBucketWebsiteRequest;
(function (GetBucketWebsiteRequest) {
    GetBucketWebsiteRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetBucketWebsiteRequest || (GetBucketWebsiteRequest = {}));
var GetObjectOutput;
(function (GetObjectOutput) {
    GetObjectOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(GetObjectOutput || (GetObjectOutput = {}));
var GetObjectRequest;
(function (GetObjectRequest) {
    GetObjectRequest.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSECustomerKey && { SSECustomerKey: SENSITIVE_STRING }),
    });
})(GetObjectRequest || (GetObjectRequest = {}));
var NoSuchKey;
(function (NoSuchKey) {
    NoSuchKey.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(NoSuchKey || (NoSuchKey = {}));
var GetObjectAclOutput;
(function (GetObjectAclOutput) {
    GetObjectAclOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectAclOutput || (GetObjectAclOutput = {}));
var GetObjectAclRequest;
(function (GetObjectAclRequest) {
    GetObjectAclRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectAclRequest || (GetObjectAclRequest = {}));
var ObjectLockLegalHold;
(function (ObjectLockLegalHold) {
    ObjectLockLegalHold.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectLockLegalHold || (ObjectLockLegalHold = {}));
var GetObjectLegalHoldOutput;
(function (GetObjectLegalHoldOutput) {
    GetObjectLegalHoldOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectLegalHoldOutput || (GetObjectLegalHoldOutput = {}));
var GetObjectLegalHoldRequest;
(function (GetObjectLegalHoldRequest) {
    GetObjectLegalHoldRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectLegalHoldRequest || (GetObjectLegalHoldRequest = {}));
var DefaultRetention;
(function (DefaultRetention) {
    DefaultRetention.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DefaultRetention || (DefaultRetention = {}));
var ObjectLockRule;
(function (ObjectLockRule) {
    ObjectLockRule.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectLockRule || (ObjectLockRule = {}));
var ObjectLockConfiguration;
(function (ObjectLockConfiguration) {
    ObjectLockConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectLockConfiguration || (ObjectLockConfiguration = {}));
var GetObjectLockConfigurationOutput;
(function (GetObjectLockConfigurationOutput) {
    GetObjectLockConfigurationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectLockConfigurationOutput || (GetObjectLockConfigurationOutput = {}));
var GetObjectLockConfigurationRequest;
(function (GetObjectLockConfigurationRequest) {
    GetObjectLockConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectLockConfigurationRequest || (GetObjectLockConfigurationRequest = {}));
var ObjectLockRetention;
(function (ObjectLockRetention) {
    ObjectLockRetention.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectLockRetention || (ObjectLockRetention = {}));
var GetObjectRetentionOutput;
(function (GetObjectRetentionOutput) {
    GetObjectRetentionOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectRetentionOutput || (GetObjectRetentionOutput = {}));
var GetObjectRetentionRequest;
(function (GetObjectRetentionRequest) {
    GetObjectRetentionRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectRetentionRequest || (GetObjectRetentionRequest = {}));
var GetObjectTaggingOutput;
(function (GetObjectTaggingOutput) {
    GetObjectTaggingOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectTaggingOutput || (GetObjectTaggingOutput = {}));
var GetObjectTaggingRequest;
(function (GetObjectTaggingRequest) {
    GetObjectTaggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectTaggingRequest || (GetObjectTaggingRequest = {}));
var GetObjectTorrentOutput;
(function (GetObjectTorrentOutput) {
    GetObjectTorrentOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectTorrentOutput || (GetObjectTorrentOutput = {}));
var GetObjectTorrentRequest;
(function (GetObjectTorrentRequest) {
    GetObjectTorrentRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetObjectTorrentRequest || (GetObjectTorrentRequest = {}));
var PublicAccessBlockConfiguration;
(function (PublicAccessBlockConfiguration) {
    PublicAccessBlockConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PublicAccessBlockConfiguration || (PublicAccessBlockConfiguration = {}));
var GetPublicAccessBlockOutput;
(function (GetPublicAccessBlockOutput) {
    GetPublicAccessBlockOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetPublicAccessBlockOutput || (GetPublicAccessBlockOutput = {}));
var GetPublicAccessBlockRequest;
(function (GetPublicAccessBlockRequest) {
    GetPublicAccessBlockRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GetPublicAccessBlockRequest || (GetPublicAccessBlockRequest = {}));
var HeadBucketRequest;
(function (HeadBucketRequest) {
    HeadBucketRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(HeadBucketRequest || (HeadBucketRequest = {}));
var NoSuchBucket;
(function (NoSuchBucket) {
    NoSuchBucket.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(NoSuchBucket || (NoSuchBucket = {}));
var HeadObjectOutput;
(function (HeadObjectOutput) {
    HeadObjectOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(HeadObjectOutput || (HeadObjectOutput = {}));
var HeadObjectRequest;
(function (HeadObjectRequest) {
    HeadObjectRequest.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSECustomerKey && { SSECustomerKey: SENSITIVE_STRING }),
    });
})(HeadObjectRequest || (HeadObjectRequest = {}));
var ListBucketAnalyticsConfigurationsOutput;
(function (ListBucketAnalyticsConfigurationsOutput) {
    ListBucketAnalyticsConfigurationsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListBucketAnalyticsConfigurationsOutput || (ListBucketAnalyticsConfigurationsOutput = {}));
var ListBucketAnalyticsConfigurationsRequest;
(function (ListBucketAnalyticsConfigurationsRequest) {
    ListBucketAnalyticsConfigurationsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListBucketAnalyticsConfigurationsRequest || (ListBucketAnalyticsConfigurationsRequest = {}));
var ListBucketInventoryConfigurationsOutput;
(function (ListBucketInventoryConfigurationsOutput) {
    ListBucketInventoryConfigurationsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.InventoryConfigurationList && {
            InventoryConfigurationList: obj.InventoryConfigurationList.map((item) => InventoryConfiguration.filterSensitiveLog(item)),
        }),
    });
})(ListBucketInventoryConfigurationsOutput || (ListBucketInventoryConfigurationsOutput = {}));
var ListBucketInventoryConfigurationsRequest;
(function (ListBucketInventoryConfigurationsRequest) {
    ListBucketInventoryConfigurationsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListBucketInventoryConfigurationsRequest || (ListBucketInventoryConfigurationsRequest = {}));
var ListBucketMetricsConfigurationsOutput;
(function (ListBucketMetricsConfigurationsOutput) {
    ListBucketMetricsConfigurationsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListBucketMetricsConfigurationsOutput || (ListBucketMetricsConfigurationsOutput = {}));
var ListBucketMetricsConfigurationsRequest;
(function (ListBucketMetricsConfigurationsRequest) {
    ListBucketMetricsConfigurationsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListBucketMetricsConfigurationsRequest || (ListBucketMetricsConfigurationsRequest = {}));
var Bucket;
(function (Bucket) {
    Bucket.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Bucket || (Bucket = {}));
var ListBucketsOutput;
(function (ListBucketsOutput) {
    ListBucketsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListBucketsOutput || (ListBucketsOutput = {}));
var CommonPrefix;
(function (CommonPrefix) {
    CommonPrefix.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CommonPrefix || (CommonPrefix = {}));
var Initiator;
(function (Initiator) {
    Initiator.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Initiator || (Initiator = {}));
var MultipartUpload;
(function (MultipartUpload) {
    MultipartUpload.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(MultipartUpload || (MultipartUpload = {}));
var ListMultipartUploadsOutput;
(function (ListMultipartUploadsOutput) {
    ListMultipartUploadsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListMultipartUploadsOutput || (ListMultipartUploadsOutput = {}));
var ListMultipartUploadsRequest;
(function (ListMultipartUploadsRequest) {
    ListMultipartUploadsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListMultipartUploadsRequest || (ListMultipartUploadsRequest = {}));
var _Object;
(function (_Object) {
    _Object.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(_Object || (_Object = {}));
var ListObjectsOutput;
(function (ListObjectsOutput) {
    ListObjectsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListObjectsOutput || (ListObjectsOutput = {}));
var ListObjectsRequest;
(function (ListObjectsRequest) {
    ListObjectsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListObjectsRequest || (ListObjectsRequest = {}));
var ListObjectsV2Output;
(function (ListObjectsV2Output) {
    ListObjectsV2Output.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListObjectsV2Output || (ListObjectsV2Output = {}));
var ListObjectsV2Request;
(function (ListObjectsV2Request) {
    ListObjectsV2Request.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListObjectsV2Request || (ListObjectsV2Request = {}));
var DeleteMarkerEntry;
(function (DeleteMarkerEntry) {
    DeleteMarkerEntry.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(DeleteMarkerEntry || (DeleteMarkerEntry = {}));
var ObjectVersion;
(function (ObjectVersion) {
    ObjectVersion.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectVersion || (ObjectVersion = {}));
var ListObjectVersionsOutput;
(function (ListObjectVersionsOutput) {
    ListObjectVersionsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListObjectVersionsOutput || (ListObjectVersionsOutput = {}));
var ListObjectVersionsRequest;
(function (ListObjectVersionsRequest) {
    ListObjectVersionsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListObjectVersionsRequest || (ListObjectVersionsRequest = {}));
var Part;
(function (Part) {
    Part.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Part || (Part = {}));
var ListPartsOutput;
(function (ListPartsOutput) {
    ListPartsOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListPartsOutput || (ListPartsOutput = {}));
var ListPartsRequest;
(function (ListPartsRequest) {
    ListPartsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ListPartsRequest || (ListPartsRequest = {}));
var PutBucketAccelerateConfigurationRequest;
(function (PutBucketAccelerateConfigurationRequest) {
    PutBucketAccelerateConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketAccelerateConfigurationRequest || (PutBucketAccelerateConfigurationRequest = {}));
var PutBucketAclRequest;
(function (PutBucketAclRequest) {
    PutBucketAclRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketAclRequest || (PutBucketAclRequest = {}));
var PutBucketAnalyticsConfigurationRequest;
(function (PutBucketAnalyticsConfigurationRequest) {
    PutBucketAnalyticsConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketAnalyticsConfigurationRequest || (PutBucketAnalyticsConfigurationRequest = {}));
var CORSConfiguration;
(function (CORSConfiguration) {
    CORSConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CORSConfiguration || (CORSConfiguration = {}));
var PutBucketCorsRequest;
(function (PutBucketCorsRequest) {
    PutBucketCorsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketCorsRequest || (PutBucketCorsRequest = {}));
var PutBucketEncryptionRequest;
(function (PutBucketEncryptionRequest) {
    PutBucketEncryptionRequest.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.ServerSideEncryptionConfiguration && {
            ServerSideEncryptionConfiguration: ServerSideEncryptionConfiguration.filterSensitiveLog(obj.ServerSideEncryptionConfiguration),
        }),
    });
})(PutBucketEncryptionRequest || (PutBucketEncryptionRequest = {}));
var PutBucketInventoryConfigurationRequest;
(function (PutBucketInventoryConfigurationRequest) {
    PutBucketInventoryConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.InventoryConfiguration && {
            InventoryConfiguration: InventoryConfiguration.filterSensitiveLog(obj.InventoryConfiguration),
        }),
    });
})(PutBucketInventoryConfigurationRequest || (PutBucketInventoryConfigurationRequest = {}));
var BucketLifecycleConfiguration;
(function (BucketLifecycleConfiguration) {
    BucketLifecycleConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(BucketLifecycleConfiguration || (BucketLifecycleConfiguration = {}));
var PutBucketLifecycleConfigurationRequest;
(function (PutBucketLifecycleConfigurationRequest) {
    PutBucketLifecycleConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketLifecycleConfigurationRequest || (PutBucketLifecycleConfigurationRequest = {}));
var BucketLoggingStatus;
(function (BucketLoggingStatus) {
    BucketLoggingStatus.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(BucketLoggingStatus || (BucketLoggingStatus = {}));
var PutBucketLoggingRequest;
(function (PutBucketLoggingRequest) {
    PutBucketLoggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketLoggingRequest || (PutBucketLoggingRequest = {}));
var PutBucketMetricsConfigurationRequest;
(function (PutBucketMetricsConfigurationRequest) {
    PutBucketMetricsConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketMetricsConfigurationRequest || (PutBucketMetricsConfigurationRequest = {}));
var PutBucketNotificationConfigurationRequest;
(function (PutBucketNotificationConfigurationRequest) {
    PutBucketNotificationConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketNotificationConfigurationRequest || (PutBucketNotificationConfigurationRequest = {}));
var PutBucketOwnershipControlsRequest;
(function (PutBucketOwnershipControlsRequest) {
    PutBucketOwnershipControlsRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketOwnershipControlsRequest || (PutBucketOwnershipControlsRequest = {}));
var PutBucketPolicyRequest;
(function (PutBucketPolicyRequest) {
    PutBucketPolicyRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketPolicyRequest || (PutBucketPolicyRequest = {}));
var PutBucketReplicationRequest;
(function (PutBucketReplicationRequest) {
    PutBucketReplicationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketReplicationRequest || (PutBucketReplicationRequest = {}));
var RequestPaymentConfiguration;
(function (RequestPaymentConfiguration) {
    RequestPaymentConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(RequestPaymentConfiguration || (RequestPaymentConfiguration = {}));
var PutBucketRequestPaymentRequest;
(function (PutBucketRequestPaymentRequest) {
    PutBucketRequestPaymentRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketRequestPaymentRequest || (PutBucketRequestPaymentRequest = {}));
var Tagging;
(function (Tagging) {
    Tagging.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(Tagging || (Tagging = {}));
var PutBucketTaggingRequest;
(function (PutBucketTaggingRequest) {
    PutBucketTaggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketTaggingRequest || (PutBucketTaggingRequest = {}));
var VersioningConfiguration;
(function (VersioningConfiguration) {
    VersioningConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(VersioningConfiguration || (VersioningConfiguration = {}));
var PutBucketVersioningRequest;
(function (PutBucketVersioningRequest) {
    PutBucketVersioningRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketVersioningRequest || (PutBucketVersioningRequest = {}));
var WebsiteConfiguration;
(function (WebsiteConfiguration) {
    WebsiteConfiguration.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(WebsiteConfiguration || (WebsiteConfiguration = {}));
var PutBucketWebsiteRequest;
(function (PutBucketWebsiteRequest) {
    PutBucketWebsiteRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutBucketWebsiteRequest || (PutBucketWebsiteRequest = {}));
var PutObjectOutput;
(function (PutObjectOutput) {
    PutObjectOutput.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }),
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(PutObjectOutput || (PutObjectOutput = {}));
var PutObjectRequest;
(function (PutObjectRequest) {
    PutObjectRequest.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.SSECustomerKey && { SSECustomerKey: SENSITIVE_STRING }),
        ...(obj.SSEKMSEncryptionContext && { SSEKMSEncryptionContext: SENSITIVE_STRING }),
        ...(obj.SSEKMSKeyId && { SSEKMSKeyId: SENSITIVE_STRING }),
    });
})(PutObjectRequest || (PutObjectRequest = {}));
var PutObjectAclOutput;
(function (PutObjectAclOutput) {
    PutObjectAclOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectAclOutput || (PutObjectAclOutput = {}));
var PutObjectAclRequest;
(function (PutObjectAclRequest) {
    PutObjectAclRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectAclRequest || (PutObjectAclRequest = {}));
var PutObjectLegalHoldOutput;
(function (PutObjectLegalHoldOutput) {
    PutObjectLegalHoldOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectLegalHoldOutput || (PutObjectLegalHoldOutput = {}));
var PutObjectLegalHoldRequest;
(function (PutObjectLegalHoldRequest) {
    PutObjectLegalHoldRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectLegalHoldRequest || (PutObjectLegalHoldRequest = {}));
var PutObjectLockConfigurationOutput;
(function (PutObjectLockConfigurationOutput) {
    PutObjectLockConfigurationOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectLockConfigurationOutput || (PutObjectLockConfigurationOutput = {}));
var PutObjectLockConfigurationRequest;
(function (PutObjectLockConfigurationRequest) {
    PutObjectLockConfigurationRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectLockConfigurationRequest || (PutObjectLockConfigurationRequest = {}));
var PutObjectRetentionOutput;
(function (PutObjectRetentionOutput) {
    PutObjectRetentionOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectRetentionOutput || (PutObjectRetentionOutput = {}));
var PutObjectRetentionRequest;
(function (PutObjectRetentionRequest) {
    PutObjectRetentionRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectRetentionRequest || (PutObjectRetentionRequest = {}));
var PutObjectTaggingOutput;
(function (PutObjectTaggingOutput) {
    PutObjectTaggingOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectTaggingOutput || (PutObjectTaggingOutput = {}));
var PutObjectTaggingRequest;
(function (PutObjectTaggingRequest) {
    PutObjectTaggingRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutObjectTaggingRequest || (PutObjectTaggingRequest = {}));
var PutPublicAccessBlockRequest;
(function (PutPublicAccessBlockRequest) {
    PutPublicAccessBlockRequest.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(PutPublicAccessBlockRequest || (PutPublicAccessBlockRequest = {}));
var ObjectAlreadyInActiveTierError;
(function (ObjectAlreadyInActiveTierError) {
    ObjectAlreadyInActiveTierError.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ObjectAlreadyInActiveTierError || (ObjectAlreadyInActiveTierError = {}));
var RestoreObjectOutput;
(function (RestoreObjectOutput) {
    RestoreObjectOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(RestoreObjectOutput || (RestoreObjectOutput = {}));
var GlacierJobParameters;
(function (GlacierJobParameters) {
    GlacierJobParameters.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(GlacierJobParameters || (GlacierJobParameters = {}));
var Encryption;
(function (Encryption) {
    Encryption.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.KMSKeyId && { KMSKeyId: SENSITIVE_STRING }),
    });
})(Encryption || (Encryption = {}));
var MetadataEntry;
(function (MetadataEntry) {
    MetadataEntry.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(MetadataEntry || (MetadataEntry = {}));
var S3Location;
(function (S3Location) {
    S3Location.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.Encryption && { Encryption: Encryption.filterSensitiveLog(obj.Encryption) }),
    });
})(S3Location || (S3Location = {}));
var OutputLocation;
(function (OutputLocation) {
    OutputLocation.filterSensitiveLog = (obj) => ({
        ...obj,
        ...(obj.S3 && { S3: S3Location.filterSensitiveLog(obj.S3) }),
    });
})(OutputLocation || (OutputLocation = {}));
var FileHeaderInfo;
(function (FileHeaderInfo) {
    FileHeaderInfo["IGNORE"] = "IGNORE";
    FileHeaderInfo["NONE"] = "NONE";
    FileHeaderInfo["USE"] = "USE";
})(FileHeaderInfo || (FileHeaderInfo = {}));
var CSVInput;
(function (CSVInput) {
    CSVInput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CSVInput || (CSVInput = {}));
var JSONType;
(function (JSONType) {
    JSONType["DOCUMENT"] = "DOCUMENT";
    JSONType["LINES"] = "LINES";
})(JSONType || (JSONType = {}));
var JSONInput;
(function (JSONInput) {
    JSONInput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(JSONInput || (JSONInput = {}));
var ParquetInput;
(function (ParquetInput) {
    ParquetInput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(ParquetInput || (ParquetInput = {}));
var InputSerialization;
(function (InputSerialization) {
    InputSerialization.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(InputSerialization || (InputSerialization = {}));
var QuoteFields;
(function (QuoteFields) {
    QuoteFields["ALWAYS"] = "ALWAYS";
    QuoteFields["ASNEEDED"] = "ASNEEDED";
})(QuoteFields || (QuoteFields = {}));
var CSVOutput;
(function (CSVOutput) {
    CSVOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(CSVOutput || (CSVOutput = {}));
var JSONOutput;
(function (JSONOutput) {
    JSONOutput.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(JSONOutput || (JSONOutput = {}));
var OutputSerialization;
(function (OutputSerialization) {
    OutputSerialization.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(OutputSerialization || (OutputSerialization = {}));
var SelectParameters;
(function (SelectParameters) {
    SelectParameters.filterSensitiveLog = (obj) => ({
        ...obj,
    });
})(SelectParameters || (SelectParameters = {}));

var util = createCommonjsModule(function (module, exports) {

const nameStartChar = ':A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const nameChar = nameStartChar + '\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const nameRegexp = '[' + nameStartChar + '][' + nameChar + ']*';
const regexName = new RegExp('^' + nameRegexp + '$');

const getAllMatches = function(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
};

const isName = function(string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === 'undefined');
};

exports.isExist = function(v) {
  return typeof v !== 'undefined';
};

exports.isEmptyObject = function(obj) {
  return Object.keys(obj).length === 0;
};

/**
 * Copy all the properties of a into b.
 * @param {*} target
 * @param {*} a
 */
exports.merge = function(target, a, arrayMode) {
  if (a) {
    const keys = Object.keys(a); // will return an array of own properties
    const len = keys.length; //don't make it inline
    for (let i = 0; i < len; i++) {
      if(arrayMode === 'strict'){
        target[keys[i]] = [ a[keys[i]] ];
      }else {
        target[keys[i]] = a[keys[i]];
      }
    }
  }
};
/* exports.merge =function (b,a){
  return Object.assign(b,a);
} */

exports.getValue = function(v) {
  if (exports.isExist(v)) {
    return v;
  } else {
    return '';
  }
};

// const fakeCall = function(a) {return a;};
// const fakeCallNoReturn = function() {};

exports.buildOptions = function(options, defaultOptions, props) {
  var newOptions = {};
  if (!options) {
    return defaultOptions; //if there are not options
  }

  for (let i = 0; i < props.length; i++) {
    if (options[props[i]] !== undefined) {
      newOptions[props[i]] = options[props[i]];
    } else {
      newOptions[props[i]] = defaultOptions[props[i]];
    }
  }
  return newOptions;
};

exports.isName = isName;
exports.getAllMatches = getAllMatches;
exports.nameRegexp = nameRegexp;
});

const convertToJson = function(node, options) {
  const jObj = {};

  //when no child node or attr is present
  if ((!node.child || util.isEmptyObject(node.child)) && (!node.attrsMap || util.isEmptyObject(node.attrsMap))) {
    return util.isExist(node.val) ? node.val : '';
  } else {
    //otherwise create a textnode if node has some text
    if (util.isExist(node.val)) {
      if (!(typeof node.val === 'string' && (node.val === '' || node.val === options.cdataPositionChar))) {
        if(options.arrayMode === "strict"){
          jObj[options.textNodeName] = [ node.val ];
        }else {
          jObj[options.textNodeName] = node.val;
        }
      }
    }
  }

  util.merge(jObj, node.attrsMap, options.arrayMode);

  const keys = Object.keys(node.child);
  for (let index = 0; index < keys.length; index++) {
    var tagname = keys[index];
    if (node.child[tagname] && node.child[tagname].length > 1) {
      jObj[tagname] = [];
      for (var tag in node.child[tagname]) {
        jObj[tagname].push(convertToJson(node.child[tagname][tag], options));
      }
    } else {
      if(options.arrayMode === true){
        const result = convertToJson(node.child[tagname][0], options);
        if(typeof result === 'object')
          jObj[tagname] = [ result ];
        else
          jObj[tagname] = result;
      }else if(options.arrayMode === "strict"){
        jObj[tagname] = [convertToJson(node.child[tagname][0], options) ];
      }else {
        jObj[tagname] = convertToJson(node.child[tagname][0], options);
      }
    }
  }

  //add value
  return jObj;
};

var convertToJson_1 = convertToJson;

var node2json = {
	convertToJson: convertToJson_1
};

var xmlNode = function(tagname, parent, val) {
  this.tagname = tagname;
  this.parent = parent;
  this.child = {}; //child tags
  this.attrsMap = {}; //attributes map
  this.val = val; //text only
  this.addChild = function(child) {
    if (Array.isArray(this.child[child.tagname])) {
      //already presents
      this.child[child.tagname].push(child);
    } else {
      this.child[child.tagname] = [child];
    }
  };
};

const buildOptions = util.buildOptions;

const regx =
  '<((!\\[CDATA\\[([\\s\\S]*?)(]]>))|((NAME:)?(NAME))([^>]*)>|((\\/)(NAME)\\s*>))([^<]*)'
  .replace(/NAME/g, util.nameRegexp);

//const tagsRegx = new RegExp("<(\\/?[\\w:\\-\._]+)([^>]*)>(\\s*"+cdataRegx+")*([^<]+)?","g");
//const tagsRegx = new RegExp("<(\\/?)((\\w*:)?([\\w:\\-\._]+))([^>]*)>([^<]*)("+cdataRegx+"([^<]*))*([^<]+)?","g");

//polyfill
if (!Number.parseInt && window.parseInt) {
  Number.parseInt = window.parseInt;
}
if (!Number.parseFloat && window.parseFloat) {
  Number.parseFloat = window.parseFloat;
}

const defaultOptions$1 = {
  attributeNamePrefix: '@_',
  attrNodeName: false,
  textNodeName: '#text',
  ignoreAttributes: true,
  ignoreNameSpace: false,
  allowBooleanAttributes: false, //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseNodeValue: true,
  parseAttributeValue: false,
  arrayMode: false,
  trimValues: true, //Trim string values of tag and attributes
  cdataTagName: false,
  cdataPositionChar: '\\c',
  tagValueProcessor: function(a, tagName) {
    return a;
  },
  attrValueProcessor: function(a, attrName) {
    return a;
  },
  stopNodes: []
  //decodeStrict: false,
};

var defaultOptions_1 = defaultOptions$1;

const props = [
  'attributeNamePrefix',
  'attrNodeName',
  'textNodeName',
  'ignoreAttributes',
  'ignoreNameSpace',
  'allowBooleanAttributes',
  'parseNodeValue',
  'parseAttributeValue',
  'arrayMode',
  'trimValues',
  'cdataTagName',
  'cdataPositionChar',
  'tagValueProcessor',
  'attrValueProcessor',
  'parseTrueNumberOnly',
  'stopNodes'
];
var props_1 = props;

/**
 * Trim -> valueProcessor -> parse value
 * @param {string} tagName
 * @param {string} val
 * @param {object} options
 */
function processTagValue(tagName, val, options) {
  if (val) {
    if (options.trimValues) {
      val = val.trim();
    }
    val = options.tagValueProcessor(val, tagName);
    val = parseValue(val, options.parseNodeValue, options.parseTrueNumberOnly);
  }

  return val;
}

function resolveNameSpace(tagname, options) {
  if (options.ignoreNameSpace) {
    const tags = tagname.split(':');
    const prefix = tagname.charAt(0) === '/' ? '/' : '';
    if (tags[0] === 'xmlns') {
      return '';
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}

function parseValue(val, shouldParse, parseTrueNumberOnly) {
  if (shouldParse && typeof val === 'string') {
    let parsed;
    if (val.trim() === '' || isNaN(val)) {
      parsed = val === 'true' ? true : val === 'false' ? false : val;
    } else {
      if (val.indexOf('0x') !== -1) {
        //support hexa decimal
        parsed = Number.parseInt(val, 16);
      } else if (val.indexOf('.') !== -1) {
        parsed = Number.parseFloat(val);
        val = val.replace(/\.?0+$/, "");
      } else {
        parsed = Number.parseInt(val, 10);
      }
      if (parseTrueNumberOnly) {
        parsed = String(parsed) === val ? parsed : val;
      }
    }
    return parsed;
  } else {
    if (util.isExist(val)) {
      return val;
    } else {
      return '';
    }
  }
}

//TODO: change regex to capture NS
//const attrsRegx = new RegExp("([\\w\\-\\.\\:]+)\\s*=\\s*(['\"])((.|\n)*?)\\2","gm");
const attrsRegx = new RegExp('([^\\s=]+)\\s*(=\\s*([\'"])(.*?)\\3)?', 'g');

function buildAttributesMap(attrStr, options) {
  if (!options.ignoreAttributes && typeof attrStr === 'string') {
    attrStr = attrStr.replace(/\r?\n/g, ' ');
    //attrStr = attrStr || attrStr.trim();

    const matches = util.getAllMatches(attrStr, attrsRegx);
    const len = matches.length; //don't make it inline
    const attrs = {};
    for (let i = 0; i < len; i++) {
      const attrName = resolveNameSpace(matches[i][1], options);
      if (attrName.length) {
        if (matches[i][4] !== undefined) {
          if (options.trimValues) {
            matches[i][4] = matches[i][4].trim();
          }
          matches[i][4] = options.attrValueProcessor(matches[i][4], attrName);
          attrs[options.attributeNamePrefix + attrName] = parseValue(
            matches[i][4],
            options.parseAttributeValue,
            options.parseTrueNumberOnly
          );
        } else if (options.allowBooleanAttributes) {
          attrs[options.attributeNamePrefix + attrName] = true;
        }
      }
    }
    if (!Object.keys(attrs).length) {
      return;
    }
    if (options.attrNodeName) {
      const attrCollection = {};
      attrCollection[options.attrNodeName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}

const getTraversalObj = function(xmlData, options) {
  xmlData = xmlData.replace(/(\r\n)|\n/, " ");
  options = buildOptions(options, defaultOptions$1, props);
  const xmlObj = new xmlNode('!xml');
  let currentNode = xmlObj;
  let textData = "";

//function match(xmlData){
  for(let i=0; i< xmlData.length; i++){
    const ch = xmlData[i];
    if(ch === '<'){
      if( xmlData[i+1] === '/') {//Closing Tag
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i+2,closeIndex).trim();

        if(options.ignoreNameSpace){
          const colonIndex = tagName.indexOf(":");
          if(colonIndex !== -1){
            tagName = tagName.substr(colonIndex+1);
          }
        }

        /* if (currentNode.parent) {
          currentNode.parent.val = util.getValue(currentNode.parent.val) + '' + processTagValue2(tagName, textData , options);
        } */
        if(currentNode){
          if(currentNode.val){
            currentNode.val = util.getValue(currentNode.val) + '' + processTagValue(tagName, textData , options);
          }else {
            currentNode.val = processTagValue(tagName, textData , options);
          }
        }

        if (options.stopNodes.length && options.stopNodes.includes(currentNode.tagname)) {
          currentNode.child = [];
          if (currentNode.attrsMap == undefined) { currentNode.attrsMap = {};}
          currentNode.val = xmlData.substr(currentNode.startIndex + 1, i - currentNode.startIndex - 1);
        }
        currentNode = currentNode.parent;
        textData = "";
        i = closeIndex;
      } else if( xmlData[i+1] === '?') {
        i = findClosingIndex(xmlData, "?>", i, "Pi Tag is not closed.");
      } else if(xmlData.substr(i + 1, 3) === '!--') {
        i = findClosingIndex(xmlData, "-->", i, "Comment is not closed.");
      } else if( xmlData.substr(i + 1, 2) === '!D') {
        const closeIndex = findClosingIndex(xmlData, ">", i, "DOCTYPE is not closed.");
        const tagExp = xmlData.substring(i, closeIndex);
        if(tagExp.indexOf("[") >= 0){
          i = xmlData.indexOf("]>", i) + 1;
        }else {
          i = closeIndex;
        }
      }else if(xmlData.substr(i + 1, 2) === '![') {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9,closeIndex);

        //considerations
        //1. CDATA will always have parent node
        //2. A tag with CDATA is not a leaf node so it's value would be string type.
        if(textData){
          currentNode.val = util.getValue(currentNode.val) + '' + processTagValue(currentNode.tagname, textData , options);
          textData = "";
        }

        if (options.cdataTagName) {
          //add cdata node
          const childNode = new xmlNode(options.cdataTagName, currentNode, tagExp);
          currentNode.addChild(childNode);
          //for backtracking
          currentNode.val = util.getValue(currentNode.val) + options.cdataPositionChar;
          //add rest value to parent node
          if (tagExp) {
            childNode.val = tagExp;
          }
        } else {
          currentNode.val = (currentNode.val || '') + (tagExp || '');
        }

        i = closeIndex + 2;
      }else {//Opening tag
        const result = closingIndexForOpeningTag(xmlData, i+1);
        let tagExp = result.data;
        const closeIndex = result.index;
        const separatorIndex = tagExp.indexOf(" ");
        let tagName = tagExp;
        if(separatorIndex !== -1){
          tagName = tagExp.substr(0, separatorIndex).trimRight();
          tagExp = tagExp.substr(separatorIndex + 1);
        }

        if(options.ignoreNameSpace){
          const colonIndex = tagName.indexOf(":");
          if(colonIndex !== -1){
            tagName = tagName.substr(colonIndex+1);
          }
        }

        //save text to parent node
        if (currentNode && textData) {
          if(currentNode.tagname !== '!xml'){
            currentNode.val = util.getValue(currentNode.val) + '' + processTagValue( currentNode.tagname, textData, options);
          }
        }

        if(tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1){//selfClosing tag

          if(tagName[tagName.length - 1] === "/"){ //remove trailing '/'
            tagName = tagName.substr(0, tagName.length - 1);
            tagExp = tagName;
          }else {
            tagExp = tagExp.substr(0, tagExp.length - 1);
          }

          const childNode = new xmlNode(tagName, currentNode, '');
          if(tagName !== tagExp){
            childNode.attrsMap = buildAttributesMap(tagExp, options);
          }
          currentNode.addChild(childNode);
        }else {//opening tag

          const childNode = new xmlNode( tagName, currentNode );
          if (options.stopNodes.length && options.stopNodes.includes(childNode.tagname)) {
            childNode.startIndex=closeIndex;
          }
          if(tagName !== tagExp){
            childNode.attrsMap = buildAttributesMap(tagExp, options);
          }
          currentNode.addChild(childNode);
          currentNode = childNode;
        }
        textData = "";
        i = closeIndex;
      }
    }else {
      textData += xmlData[i];
    }
  }
  return xmlObj;
};

function closingIndexForOpeningTag(data, i){
  let attrBoundary;
  let tagExp = "";
  for (let index = i; index < data.length; index++) {
    let ch = data[index];
    if (attrBoundary) {
        if (ch === attrBoundary) attrBoundary = "";//reset
    } else if (ch === '"' || ch === "'") {
        attrBoundary = ch;
    } else if (ch === '>') {
        return {
          data: tagExp,
          index: index
        }
    } else if (ch === '\t') {
      ch = " ";
    }
    tagExp += ch;
  }
}

function findClosingIndex(xmlData, str, i, errMsg){
  const closingIndex = xmlData.indexOf(str, i);
  if(closingIndex === -1){
    throw new Error(errMsg)
  }else {
    return closingIndex + str.length - 1;
  }
}

var getTraversalObj_1 = getTraversalObj;

var xmlstr2xmlnode = {
	defaultOptions: defaultOptions_1,
	props: props_1,
	getTraversalObj: getTraversalObj_1
};

const defaultOptions$2 = {
  allowBooleanAttributes: false, //A tag can have attributes without any value
};

const props$1 = ['allowBooleanAttributes'];

//const tagsPattern = new RegExp("<\\/?([\\w:\\-_\.]+)\\s*\/?>","g");
var validate$2 = function (xmlData, options) {
  options = util.buildOptions(options, defaultOptions$2, props$1);

  //xmlData = xmlData.replace(/(\r\n|\n|\r)/gm,"");//make it single line
  //xmlData = xmlData.replace(/(^\s*<\?xml.*?\?>)/g,"");//Remove XML starting tag
  //xmlData = xmlData.replace(/(<!DOCTYPE[\s\w\"\.\/\-\:]+(\[.*\])*\s*>)/g,"");//Remove DOCTYPE
  const tags = [];
  let tagFound = false;

  //indicates that the root tag has been closed (aka. depth 0 has been reached)
  let reachedRoot = false;

  if (xmlData[0] === '\ufeff') {
    // check for byte order mark (BOM)
    xmlData = xmlData.substr(1);
  }

  for (let i = 0; i < xmlData.length; i++) {
    if (xmlData[i] === '<') {
      //starting of tag
      //read until you reach to '>' avoiding any '>' in attribute value

      i++;
      if (xmlData[i] === '?') {
        i = readPI(xmlData, ++i);
        if (i.err) {
          return i;
        }
      } else if (xmlData[i] === '!') {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === '/') {
          //closing tag
          closingTag = true;
          i++;
        }
        //read tagname
        let tagName = '';
        for (; i < xmlData.length &&
          xmlData[i] !== '>' &&
          xmlData[i] !== ' ' &&
          xmlData[i] !== '\t' &&
          xmlData[i] !== '\n' &&
          xmlData[i] !== '\r'; i++
        ) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        //console.log(tagName);

        if (tagName[tagName.length - 1] === '/') {
          //self closing tag without attributes
          tagName = tagName.substring(0, tagName.length - 1);
          //continue;
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "There is an unnecessary space between tag name and backward slash '</ ..'.";
          } else {
            msg = "Tag '"+tagName+"' is an invalid name.";
          }
          return getErrorObject('InvalidTag', msg, getLineNumberForPosition(xmlData, i));
        }

        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject('InvalidAttr', "Attributes for '"+tagName+"' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;

        if (attrStr[attrStr.length - 1] === '/') {
          //self closing tag
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
            //continue; //text may presents after self closing tag
          } else {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject('InvalidTag', "Closing tag '"+tagName+"' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject('InvalidTag', "Closing tag '"+tagName+"' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, i));
          } else {
            const otg = tags.pop();
            if (tagName !== otg) {
              return getErrorObject('InvalidTag', "Closing tag '"+otg+"' is expected inplace of '"+tagName+"'.", getLineNumberForPosition(xmlData, i));
            }

            //when there are no more tags, we reached the root level.
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }

          //if the root level has been reached before ...
          if (reachedRoot === true) {
            return getErrorObject('InvalidXml', 'Multiple possible root nodes found.', getLineNumberForPosition(xmlData, i));
          } else {
            tags.push(tagName);
          }
          tagFound = true;
        }

        //skip tag text value
        //It may include comments and CDATA value
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === '<') {
            if (xmlData[i + 1] === '!') {
              //comment or CADATA
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else {
              break;
            }
          } else if (xmlData[i] === '&') {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject('InvalidChar', "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          }
        } //end of reading tag text value
        if (xmlData[i] === '<') {
          i--;
        }
      }
    } else {
      if (xmlData[i] === ' ' || xmlData[i] === '\t' || xmlData[i] === '\n' || xmlData[i] === '\r') {
        continue;
      }
      return getErrorObject('InvalidChar', "char '"+xmlData[i]+"' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }

  if (!tagFound) {
    return getErrorObject('InvalidXml', 'Start tag expected.', 1);
  } else if (tags.length > 0) {
    return getErrorObject('InvalidXml', "Invalid '"+JSON.stringify(tags, null, 4).replace(/\r?\n/g, '')+"' found.", 1);
  }

  return true;
};

/**
 * Read Processing insstructions and skip
 * @param {*} xmlData
 * @param {*} i
 */
function readPI(xmlData, i) {
  var start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == '?' || xmlData[i] == ' ') {
      //tagname
      var tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === 'xml') {
        return getErrorObject('InvalidXml', 'XML declaration allowed only at the start of the document.', getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == '?' && xmlData[i + 1] == '>') {
        //check if valid attribut string
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}

function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === '-' && xmlData[i + 2] === '-') {
    //comment
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === '-' && xmlData[i + 1] === '-' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  } else if (
    xmlData.length > i + 8 &&
    xmlData[i + 1] === 'D' &&
    xmlData[i + 2] === 'O' &&
    xmlData[i + 3] === 'C' &&
    xmlData[i + 4] === 'T' &&
    xmlData[i + 5] === 'Y' &&
    xmlData[i + 6] === 'P' &&
    xmlData[i + 7] === 'E'
  ) {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === '<') {
        angleBracketsCount++;
      } else if (xmlData[i] === '>') {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (
    xmlData.length > i + 9 &&
    xmlData[i + 1] === '[' &&
    xmlData[i + 2] === 'C' &&
    xmlData[i + 3] === 'D' &&
    xmlData[i + 4] === 'A' &&
    xmlData[i + 5] === 'T' &&
    xmlData[i + 6] === 'A' &&
    xmlData[i + 7] === '['
  ) {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === ']' && xmlData[i + 1] === ']' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  }

  return i;
}

var doubleQuote = '"';
var singleQuote = "'";

/**
 * Keep reading xmlData until '<' is found outside the attribute value.
 * @param {string} xmlData
 * @param {number} i
 */
function readAttributeStr(xmlData, i) {
  let attrStr = '';
  let startChar = '';
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === '') {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) {
        //if vaue is enclosed with double quote then single quotes are allowed inside the value and vice versa
        continue;
      } else {
        startChar = '';
      }
    } else if (xmlData[i] === '>') {
      if (startChar === '') {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== '') {
    return false;
  }

  return {
    value: attrStr,
    index: i,
    tagClosed: tagClosed
  };
}

/**
 * Select all the attributes whether valid or invalid.
 */
const validAttrStrRegxp = new RegExp('(\\s*)([^\\s=]+)(\\s*=)?(\\s*([\'"])(([\\s\\S])*?)\\5)?', 'g');

//attr, ="sd", a="amit's", a="sd"b="saf", ab  cd=""

function validateAttributeString(attrStr, options) {
  //console.log("start:"+attrStr+":end");

  //if(attrStr.trim().length === 0) return true; //empty string

  const matches = util.getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};

  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      //nospace before attribute name: a="sd"b="saf"
      return getErrorObject('InvalidAttr', "Attribute '"+matches[i][2]+"' has no space in starting.", getPositionFromMatch(attrStr, matches[i][0]))
    } else if (matches[i][3] === undefined && !options.allowBooleanAttributes) {
      //independent attribute: ab
      return getErrorObject('InvalidAttr', "boolean attribute '"+matches[i][2]+"' is not allowed.", getPositionFromMatch(attrStr, matches[i][0]));
    }
    /* else if(matches[i][6] === undefined){//attribute without value: ab=
                    return { err: { code:"InvalidAttr",msg:"attribute " + matches[i][2] + " has no value assigned."}};
                } */
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject('InvalidAttr', "Attribute '"+attrName+"' is an invalid name.", getPositionFromMatch(attrStr, matches[i][0]));
    }
    if (!attrNames.hasOwnProperty(attrName)) {
      //check for duplicate attribute.
      attrNames[attrName] = 1;
    } else {
      return getErrorObject('InvalidAttr', "Attribute '"+attrName+"' is repeated.", getPositionFromMatch(attrStr, matches[i][0]));
    }
  }

  return true;
}

function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === 'x') {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ';')
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}

function validateAmpersand(xmlData, i) {
  // https://www.w3.org/TR/xml/#dt-charref
  i++;
  if (xmlData[i] === ';')
    return -1;
  if (xmlData[i] === '#') {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ';')
      break;
    return -1;
  }
  return i;
}

function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code: code,
      msg: message,
      line: lineNumber,
    },
  };
}

function validateAttrName(attrName) {
  return util.isName(attrName);
}

// const startsWithXML = /^xml/i;

function validateTagName(tagname) {
  return util.isName(tagname) /* && !tagname.match(startsWithXML) */;
}

//this function returns the line number for the character at the given index
function getLineNumberForPosition(xmlData, index) {
  var lines = xmlData.substring(0, index).split(/\r?\n/);
  return lines.length;
}

//this function returns the position of the last character of match within attrStr
function getPositionFromMatch(attrStr, match) {
  return attrStr.indexOf(match) + match.length;
}

var validator = {
	validate: validate$2
};

const char = function(a) {
  return String.fromCharCode(a);
};

const chars = {
  nilChar: char(176),
  missingChar: char(201),
  nilPremitive: char(175),
  missingPremitive: char(200),

  emptyChar: char(178),
  emptyValue: char(177), //empty Premitive

  boundryChar: char(179),

  objStart: char(198),
  arrStart: char(204),
  arrayEnd: char(185),
};

const charsArr = [
  chars.nilChar,
  chars.nilPremitive,
  chars.missingChar,
  chars.missingPremitive,
  chars.boundryChar,
  chars.emptyChar,
  chars.emptyValue,
  chars.arrayEnd,
  chars.objStart,
  chars.arrStart,
];

const _e = function(node, e_schema, options) {
  if (typeof e_schema === 'string') {
    //premitive
    if (node && node[0] && node[0].val !== undefined) {
      return getValue(node[0].val);
    } else {
      return getValue(node);
    }
  } else {
    const hasValidData = hasData(node);
    if (hasValidData === true) {
      let str = '';
      if (Array.isArray(e_schema)) {
        //attributes can't be repeated. hence check in children tags only
        str += chars.arrStart;
        const itemSchema = e_schema[0];
        //var itemSchemaType = itemSchema;
        const arr_len = node.length;

        if (typeof itemSchema === 'string') {
          for (let arr_i = 0; arr_i < arr_len; arr_i++) {
            const r = getValue(node[arr_i].val);
            str = processValue(str, r);
          }
        } else {
          for (let arr_i = 0; arr_i < arr_len; arr_i++) {
            const r = _e(node[arr_i], itemSchema, options);
            str = processValue(str, r);
          }
        }
        str += chars.arrayEnd; //indicates that next item is not array item
      } else {
        //object
        str += chars.objStart;
        const keys = Object.keys(e_schema);
        if (Array.isArray(node)) {
          node = node[0];
        }
        for (let i in keys) {
          const key = keys[i];
          //a property defined in schema can be present either in attrsMap or children tags
          //options.textNodeName will not present in both maps, take it's value from val
          //options.attrNodeName will be present in attrsMap
          let r;
          if (!options.ignoreAttributes && node.attrsMap && node.attrsMap[key]) {
            r = _e(node.attrsMap[key], e_schema[key], options);
          } else if (key === options.textNodeName) {
            r = _e(node.val, e_schema[key], options);
          } else {
            r = _e(node.child[key], e_schema[key], options);
          }
          str = processValue(str, r);
        }
      }
      return str;
    } else {
      return hasValidData;
    }
  }
};

const getValue = function(a /*, type*/) {
  switch (a) {
    case undefined:
      return chars.missingPremitive;
    case null:
      return chars.nilPremitive;
    case '':
      return chars.emptyValue;
    default:
      return a;
  }
};

const processValue = function(str, r) {
  if (!isAppChar(r[0]) && !isAppChar(str[str.length - 1])) {
    str += chars.boundryChar;
  }
  return str + r;
};

const isAppChar = function(ch) {
  return charsArr.indexOf(ch) !== -1;
};

function hasData(jObj) {
  if (jObj === undefined) {
    return chars.missingChar;
  } else if (jObj === null) {
    return chars.nilChar;
  } else if (
    jObj.child &&
    Object.keys(jObj.child).length === 0 &&
    (!jObj.attrsMap || Object.keys(jObj.attrsMap).length === 0)
  ) {
    return chars.emptyChar;
  } else {
    return true;
  }
}


const buildOptions$1 = util.buildOptions;

const convert2nimn = function(node, e_schema, options) {
  options = buildOptions$1(options, xmlstr2xmlnode.defaultOptions, xmlstr2xmlnode.props);
  return _e(node, e_schema, options);
};

var convert2nimn_1 = convert2nimn;

var nimndata = {
	convert2nimn: convert2nimn_1
};

const buildOptions$2 = util.buildOptions;


//TODO: do it later
const convertToJsonString = function(node, options) {
  options = buildOptions$2(options, xmlstr2xmlnode.defaultOptions, xmlstr2xmlnode.props);

  options.indentBy = options.indentBy || '';
  return _cToJsonStr(node, options);
};

const _cToJsonStr = function(node, options, level) {
  let jObj = '{';

  //traver through all the children
  const keys = Object.keys(node.child);

  for (let index = 0; index < keys.length; index++) {
    var tagname = keys[index];
    if (node.child[tagname] && node.child[tagname].length > 1) {
      jObj += '"' + tagname + '" : [ ';
      for (var tag in node.child[tagname]) {
        jObj += _cToJsonStr(node.child[tagname][tag], options) + ' , ';
      }
      jObj = jObj.substr(0, jObj.length - 1) + ' ] '; //remove extra comma in last
    } else {
      jObj += '"' + tagname + '" : ' + _cToJsonStr(node.child[tagname][0], options) + ' ,';
    }
  }
  util.merge(jObj, node.attrsMap);
  //add attrsMap as new children
  if (util.isEmptyObject(jObj)) {
    return util.isExist(node.val) ? node.val : '';
  } else {
    if (util.isExist(node.val)) {
      if (!(typeof node.val === 'string' && (node.val === '' || node.val === options.cdataPositionChar))) {
        jObj += '"' + options.textNodeName + '" : ' + stringval(node.val);
      }
    }
  }
  //add value
  if (jObj[jObj.length - 1] === ',') {
    jObj = jObj.substr(0, jObj.length - 2);
  }
  return jObj + '}';
};

function stringval(v) {
  if (v === true || v === false || !isNaN(v)) {
    return v;
  } else {
    return '"' + v + '"';
  }
}

var convertToJsonString_1 = convertToJsonString;

var node2json_str = {
	convertToJsonString: convertToJsonString_1
};

//parse Empty Node as self closing node
const buildOptions$3 = util.buildOptions;

const defaultOptions$3 = {
  attributeNamePrefix: '@_',
  attrNodeName: false,
  textNodeName: '#text',
  ignoreAttributes: true,
  cdataTagName: false,
  cdataPositionChar: '\\c',
  format: false,
  indentBy: '  ',
  supressEmptyNode: false,
  tagValueProcessor: function(a) {
    return a;
  },
  attrValueProcessor: function(a) {
    return a;
  },
};

const props$2 = [
  'attributeNamePrefix',
  'attrNodeName',
  'textNodeName',
  'ignoreAttributes',
  'cdataTagName',
  'cdataPositionChar',
  'format',
  'indentBy',
  'supressEmptyNode',
  'tagValueProcessor',
  'attrValueProcessor',
];

function Parser(options) {
  this.options = buildOptions$3(options, defaultOptions$3, props$2);
  if (this.options.ignoreAttributes || this.options.attrNodeName) {
    this.isAttribute = function(/*a*/) {
      return false;
    };
  } else {
    this.attrPrefixLen = this.options.attributeNamePrefix.length;
    this.isAttribute = isAttribute;
  }
  if (this.options.cdataTagName) {
    this.isCDATA = isCDATA;
  } else {
    this.isCDATA = function(/*a*/) {
      return false;
    };
  }
  this.replaceCDATAstr = replaceCDATAstr;
  this.replaceCDATAarr = replaceCDATAarr;

  if (this.options.format) {
    this.indentate = indentate;
    this.tagEndChar = '>\n';
    this.newLine = '\n';
  } else {
    this.indentate = function() {
      return '';
    };
    this.tagEndChar = '>';
    this.newLine = '';
  }

  if (this.options.supressEmptyNode) {
    this.buildTextNode = buildEmptyTextNode;
    this.buildObjNode = buildEmptyObjNode;
  } else {
    this.buildTextNode = buildTextValNode;
    this.buildObjNode = buildObjectNode;
  }

  this.buildTextValNode = buildTextValNode;
  this.buildObjectNode = buildObjectNode;
}

Parser.prototype.parse = function(jObj) {
  return this.j2x(jObj, 0).val;
};

Parser.prototype.j2x = function(jObj, level) {
  let attrStr = '';
  let val = '';
  const keys = Object.keys(jObj);
  const len = keys.length;
  for (let i = 0; i < len; i++) {
    const key = keys[i];
    if (typeof jObj[key] === 'undefined') ; else if (jObj[key] === null) {
      val += this.indentate(level) + '<' + key + '/' + this.tagEndChar;
    } else if (jObj[key] instanceof Date) {
      val += this.buildTextNode(jObj[key], key, '', level);
    } else if (typeof jObj[key] !== 'object') {
      //premitive type
      const attr = this.isAttribute(key);
      if (attr) {
        attrStr += ' ' + attr + '="' + this.options.attrValueProcessor('' + jObj[key]) + '"';
      } else if (this.isCDATA(key)) {
        if (jObj[this.options.textNodeName]) {
          val += this.replaceCDATAstr(jObj[this.options.textNodeName], jObj[key]);
        } else {
          val += this.replaceCDATAstr('', jObj[key]);
        }
      } else {
        //tag value
        if (key === this.options.textNodeName) {
          if (jObj[this.options.cdataTagName]) ; else {
            val += this.options.tagValueProcessor('' + jObj[key]);
          }
        } else {
          val += this.buildTextNode(jObj[key], key, '', level);
        }
      }
    } else if (Array.isArray(jObj[key])) {
      //repeated nodes
      if (this.isCDATA(key)) {
        val += this.indentate(level);
        if (jObj[this.options.textNodeName]) {
          val += this.replaceCDATAarr(jObj[this.options.textNodeName], jObj[key]);
        } else {
          val += this.replaceCDATAarr('', jObj[key]);
        }
      } else {
        //nested nodes
        const arrLen = jObj[key].length;
        for (let j = 0; j < arrLen; j++) {
          const item = jObj[key][j];
          if (typeof item === 'undefined') ; else if (item === null) {
            val += this.indentate(level) + '<' + key + '/' + this.tagEndChar;
          } else if (typeof item === 'object') {
            const result = this.j2x(item, level + 1);
            val += this.buildObjNode(result.val, key, result.attrStr, level);
          } else {
            val += this.buildTextNode(item, key, '', level);
          }
        }
      }
    } else {
      //nested node
      if (this.options.attrNodeName && key === this.options.attrNodeName) {
        const Ks = Object.keys(jObj[key]);
        const L = Ks.length;
        for (let j = 0; j < L; j++) {
          attrStr += ' ' + Ks[j] + '="' + this.options.attrValueProcessor('' + jObj[key][Ks[j]]) + '"';
        }
      } else {
        const result = this.j2x(jObj[key], level + 1);
        val += this.buildObjNode(result.val, key, result.attrStr, level);
      }
    }
  }
  return {attrStr: attrStr, val: val};
};

function replaceCDATAstr(str, cdata) {
  str = this.options.tagValueProcessor('' + str);
  if (this.options.cdataPositionChar === '' || str === '') {
    return str + '<![CDATA[' + cdata + ']]' + this.tagEndChar;
  } else {
    return str.replace(this.options.cdataPositionChar, '<![CDATA[' + cdata + ']]' + this.tagEndChar);
  }
}

function replaceCDATAarr(str, cdata) {
  str = this.options.tagValueProcessor('' + str);
  if (this.options.cdataPositionChar === '' || str === '') {
    return str + '<![CDATA[' + cdata.join(']]><![CDATA[') + ']]' + this.tagEndChar;
  } else {
    for (let v in cdata) {
      str = str.replace(this.options.cdataPositionChar, '<![CDATA[' + cdata[v] + ']]>');
    }
    return str + this.newLine;
  }
}

function buildObjectNode(val, key, attrStr, level) {
  if (attrStr && !val.includes('<')) {
    return (
      this.indentate(level) +
      '<' +
      key +
      attrStr +
      '>' +
      val +
      //+ this.newLine
      // + this.indentate(level)
      '</' +
      key +
      this.tagEndChar
    );
  } else {
    return (
      this.indentate(level) +
      '<' +
      key +
      attrStr +
      this.tagEndChar +
      val +
      //+ this.newLine
      this.indentate(level) +
      '</' +
      key +
      this.tagEndChar
    );
  }
}

function buildEmptyObjNode(val, key, attrStr, level) {
  if (val !== '') {
    return this.buildObjectNode(val, key, attrStr, level);
  } else {
    return this.indentate(level) + '<' + key + attrStr + '/' + this.tagEndChar;
    //+ this.newLine
  }
}

function buildTextValNode(val, key, attrStr, level) {
  return (
    this.indentate(level) +
    '<' +
    key +
    attrStr +
    '>' +
    this.options.tagValueProcessor(val) +
    '</' +
    key +
    this.tagEndChar
  );
}

function buildEmptyTextNode(val, key, attrStr, level) {
  if (val !== '') {
    return this.buildTextValNode(val, key, attrStr, level);
  } else {
    return this.indentate(level) + '<' + key + attrStr + '/' + this.tagEndChar;
  }
}

function indentate(level) {
  return this.options.indentBy.repeat(level);
}

function isAttribute(name /*, options*/) {
  if (name.startsWith(this.options.attributeNamePrefix)) {
    return name.substr(this.attrPrefixLen);
  } else {
    return false;
  }
}

function isCDATA(name) {
  return name === this.options.cdataTagName;
}

//formatting
//indentation
//\n after each closing or self closing tag

var json2xml = Parser;

var parser = createCommonjsModule(function (module, exports) {



const x2xmlnode = xmlstr2xmlnode;
const buildOptions = util.buildOptions;


exports.parse = function(xmlData, options, validationOption) {
  if( validationOption){
    if(validationOption === true) validationOption = {};
    
    const result = validator.validate(xmlData, validationOption);
    if (result !== true) {
      throw Error( result.err.msg)
    }
  }
  options = buildOptions(options, x2xmlnode.defaultOptions, x2xmlnode.props);
  const traversableObj = xmlstr2xmlnode.getTraversalObj(xmlData, options);
  //print(traversableObj, "  ");
  return node2json.convertToJson(traversableObj, options);
};
exports.convertTonimn = nimndata.convert2nimn;
exports.getTraversalObj = xmlstr2xmlnode.getTraversalObj;
exports.convertToJson = node2json.convertToJson;
exports.convertToJsonString = node2json_str.convertToJsonString;
exports.validate = validator.validate;
exports.j2xParser = json2xml;
exports.parseToNimn = function(xmlData, schema, options) {
  return exports.convertTonimn(exports.getTraversalObj(xmlData, options), schema, options);
};
});

const serializeAws_restXmlGetObjectCommand = async (input, context) => {
    const headers = {
        "Content-Type": "",
        ...(isSerializableHeaderValue(input.SSECustomerKey) && {
            "x-amz-server-side-encryption-customer-key": input.SSECustomerKey,
        }),
        ...(isSerializableHeaderValue(input.SSECustomerAlgorithm) && {
            "x-amz-server-side-encryption-customer-algorithm": input.SSECustomerAlgorithm,
        }),
        ...(isSerializableHeaderValue(input.SSECustomerKeyMD5) && {
            "x-amz-server-side-encryption-customer-key-MD5": input.SSECustomerKeyMD5,
        }),
        ...(isSerializableHeaderValue(input.RequestPayer) && { "x-amz-request-payer": input.RequestPayer }),
        ...(isSerializableHeaderValue(input.ExpectedBucketOwner) && {
            "x-amz-expected-bucket-owner": input.ExpectedBucketOwner,
        }),
        ...(isSerializableHeaderValue(input.IfUnmodifiedSince) && {
            "If-Unmodified-Since": dateToUtcString(input.IfUnmodifiedSince).toString(),
        }),
        ...(isSerializableHeaderValue(input.IfModifiedSince) && {
            "If-Modified-Since": dateToUtcString(input.IfModifiedSince).toString(),
        }),
        ...(isSerializableHeaderValue(input.IfNoneMatch) && { "If-None-Match": input.IfNoneMatch }),
        ...(isSerializableHeaderValue(input.IfMatch) && { "If-Match": input.IfMatch }),
        ...(isSerializableHeaderValue(input.Range) && { Range: input.Range }),
    };
    let resolvedPath = "/{Bucket}/{Key+}";
    if (input.Bucket !== undefined) {
        const labelValue = input.Bucket;
        if (labelValue.length <= 0) {
            throw new Error("Empty value provided for input HTTP label: Bucket.");
        }
        resolvedPath = resolvedPath.replace("{Bucket}", extendedEncodeURIComponent(labelValue));
    }
    else {
        throw new Error("No value provided for input HTTP label: Bucket.");
    }
    if (input.Key !== undefined) {
        const labelValue = input.Key;
        if (labelValue.length <= 0) {
            throw new Error("Empty value provided for input HTTP label: Key.");
        }
        resolvedPath = resolvedPath.replace("{Key+}", labelValue
            .split("/")
            .map((segment) => extendedEncodeURIComponent(segment))
            .join("/"));
    }
    else {
        throw new Error("No value provided for input HTTP label: Key.");
    }
    const query = {
        "x-id": "GetObject",
        ...(input.ResponseContentEncoding !== undefined && { "response-content-encoding": input.ResponseContentEncoding }),
        ...(input.ResponseCacheControl !== undefined && { "response-cache-control": input.ResponseCacheControl }),
        ...(input.ResponseContentLanguage !== undefined && { "response-content-language": input.ResponseContentLanguage }),
        ...(input.ResponseContentDisposition !== undefined && {
            "response-content-disposition": input.ResponseContentDisposition,
        }),
        ...(input.PartNumber !== undefined && { partNumber: input.PartNumber.toString() }),
        ...(input.VersionId !== undefined && { versionId: input.VersionId }),
        ...(input.ResponseExpires !== undefined && {
            "response-expires": (input.ResponseExpires.toISOString().split(".")[0] + "Z").toString(),
        }),
        ...(input.ResponseContentType !== undefined && { "response-content-type": input.ResponseContentType }),
    };
    let body;
    const { hostname, protocol = "https", port } = await context.endpoint();
    return new HttpRequest({
        protocol,
        hostname,
        port,
        method: "GET",
        headers,
        path: resolvedPath,
        query,
        body,
    });
};
const serializeAws_restXmlPutObjectCommand = async (input, context) => {
    const headers = {
        "Content-Type": "application/octet-stream",
        ...(isSerializableHeaderValue(input.GrantFullControl) && { "x-amz-grant-full-control": input.GrantFullControl }),
        ...(isSerializableHeaderValue(input.ContentEncoding) && { "Content-Encoding": input.ContentEncoding }),
        ...(isSerializableHeaderValue(input.RequestPayer) && { "x-amz-request-payer": input.RequestPayer }),
        ...(isSerializableHeaderValue(input.GrantReadACP) && { "x-amz-grant-read-acp": input.GrantReadACP }),
        ...(isSerializableHeaderValue(input.SSECustomerKeyMD5) && {
            "x-amz-server-side-encryption-customer-key-MD5": input.SSECustomerKeyMD5,
        }),
        ...(isSerializableHeaderValue(input.CacheControl) && { "Cache-Control": input.CacheControl }),
        ...(isSerializableHeaderValue(input.WebsiteRedirectLocation) && {
            "x-amz-website-redirect-location": input.WebsiteRedirectLocation,
        }),
        ...(isSerializableHeaderValue(input.ObjectLockLegalHoldStatus) && {
            "x-amz-object-lock-legal-hold": input.ObjectLockLegalHoldStatus,
        }),
        ...(isSerializableHeaderValue(input.GrantWriteACP) && { "x-amz-grant-write-acp": input.GrantWriteACP }),
        ...(isSerializableHeaderValue(input.ContentLength) && { "Content-Length": input.ContentLength.toString() }),
        ...(isSerializableHeaderValue(input.ObjectLockRetainUntilDate) && {
            "x-amz-object-lock-retain-until-date": (input.ObjectLockRetainUntilDate.toISOString().split(".")[0] + "Z").toString(),
        }),
        ...(isSerializableHeaderValue(input.SSECustomerAlgorithm) && {
            "x-amz-server-side-encryption-customer-algorithm": input.SSECustomerAlgorithm,
        }),
        ...(isSerializableHeaderValue(input.ContentDisposition) && { "Content-Disposition": input.ContentDisposition }),
        ...(isSerializableHeaderValue(input.SSECustomerKey) && {
            "x-amz-server-side-encryption-customer-key": input.SSECustomerKey,
        }),
        ...(isSerializableHeaderValue(input.SSEKMSEncryptionContext) && {
            "x-amz-server-side-encryption-context": input.SSEKMSEncryptionContext,
        }),
        ...(isSerializableHeaderValue(input.Tagging) && { "x-amz-tagging": input.Tagging }),
        ...(isSerializableHeaderValue(input.Expires) && { Expires: dateToUtcString(input.Expires).toString() }),
        ...(isSerializableHeaderValue(input.StorageClass) && { "x-amz-storage-class": input.StorageClass }),
        ...(isSerializableHeaderValue(input.ExpectedBucketOwner) && {
            "x-amz-expected-bucket-owner": input.ExpectedBucketOwner,
        }),
        ...(isSerializableHeaderValue(input.ContentMD5) && { "Content-MD5": input.ContentMD5 }),
        ...(isSerializableHeaderValue(input.ServerSideEncryption) && {
            "x-amz-server-side-encryption": input.ServerSideEncryption,
        }),
        ...(isSerializableHeaderValue(input.ObjectLockMode) && { "x-amz-object-lock-mode": input.ObjectLockMode }),
        ...(isSerializableHeaderValue(input.SSEKMSKeyId) && {
            "x-amz-server-side-encryption-aws-kms-key-id": input.SSEKMSKeyId,
        }),
        ...(isSerializableHeaderValue(input.ContentLanguage) && { "Content-Language": input.ContentLanguage }),
        ...(isSerializableHeaderValue(input.GrantRead) && { "x-amz-grant-read": input.GrantRead }),
        ...(isSerializableHeaderValue(input.ACL) && { "x-amz-acl": input.ACL }),
        ...(isSerializableHeaderValue(input.ContentType) && { "Content-Type": input.ContentType }),
        ...(input.Metadata !== undefined &&
            Object.keys(input.Metadata).reduce((acc, suffix) => {
                acc["x-amz-meta-" + suffix] = input.Metadata[suffix];
                return acc;
            }, {})),
    };
    let resolvedPath = "/{Bucket}/{Key+}";
    if (input.Bucket !== undefined) {
        const labelValue = input.Bucket;
        if (labelValue.length <= 0) {
            throw new Error("Empty value provided for input HTTP label: Bucket.");
        }
        resolvedPath = resolvedPath.replace("{Bucket}", extendedEncodeURIComponent(labelValue));
    }
    else {
        throw new Error("No value provided for input HTTP label: Bucket.");
    }
    if (input.Key !== undefined) {
        const labelValue = input.Key;
        if (labelValue.length <= 0) {
            throw new Error("Empty value provided for input HTTP label: Key.");
        }
        resolvedPath = resolvedPath.replace("{Key+}", labelValue
            .split("/")
            .map((segment) => extendedEncodeURIComponent(segment))
            .join("/"));
    }
    else {
        throw new Error("No value provided for input HTTP label: Key.");
    }
    const query = {
        "x-id": "PutObject",
    };
    let body;
    let contents;
    if (input.Body !== undefined) {
        contents = input.Body;
        body = contents;
    }
    const { hostname, protocol = "https", port } = await context.endpoint();
    return new HttpRequest({
        protocol,
        hostname,
        port,
        method: "PUT",
        headers,
        path: resolvedPath,
        query,
        body,
    });
};
const deserializeAws_restXmlGetObjectCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return deserializeAws_restXmlGetObjectCommandError(output, context);
    }
    const contents = {
        $metadata: deserializeMetadata(output),
        AcceptRanges: undefined,
        Body: undefined,
        CacheControl: undefined,
        ContentDisposition: undefined,
        ContentEncoding: undefined,
        ContentLanguage: undefined,
        ContentLength: undefined,
        ContentRange: undefined,
        ContentType: undefined,
        DeleteMarker: undefined,
        ETag: undefined,
        Expiration: undefined,
        Expires: undefined,
        LastModified: undefined,
        Metadata: undefined,
        MissingMeta: undefined,
        ObjectLockLegalHoldStatus: undefined,
        ObjectLockMode: undefined,
        ObjectLockRetainUntilDate: undefined,
        PartsCount: undefined,
        ReplicationStatus: undefined,
        RequestCharged: undefined,
        Restore: undefined,
        SSECustomerAlgorithm: undefined,
        SSECustomerKeyMD5: undefined,
        SSEKMSKeyId: undefined,
        ServerSideEncryption: undefined,
        StorageClass: undefined,
        TagCount: undefined,
        VersionId: undefined,
        WebsiteRedirectLocation: undefined,
    };
    if (output.headers["x-amz-object-lock-mode"] !== undefined) {
        contents.ObjectLockMode = output.headers["x-amz-object-lock-mode"];
    }
    if (output.headers["content-language"] !== undefined) {
        contents.ContentLanguage = output.headers["content-language"];
    }
    if (output.headers["content-disposition"] !== undefined) {
        contents.ContentDisposition = output.headers["content-disposition"];
    }
    if (output.headers["cache-control"] !== undefined) {
        contents.CacheControl = output.headers["cache-control"];
    }
    if (output.headers["content-type"] !== undefined) {
        contents.ContentType = output.headers["content-type"];
    }
    if (output.headers["content-range"] !== undefined) {
        contents.ContentRange = output.headers["content-range"];
    }
    if (output.headers["x-amz-server-side-encryption-aws-kms-key-id"] !== undefined) {
        contents.SSEKMSKeyId = output.headers["x-amz-server-side-encryption-aws-kms-key-id"];
    }
    if (output.headers["content-length"] !== undefined) {
        contents.ContentLength = parseInt(output.headers["content-length"], 10);
    }
    if (output.headers["x-amz-object-lock-retain-until-date"] !== undefined) {
        contents.ObjectLockRetainUntilDate = new Date(output.headers["x-amz-object-lock-retain-until-date"]);
    }
    if (output.headers["x-amz-object-lock-legal-hold"] !== undefined) {
        contents.ObjectLockLegalHoldStatus = output.headers["x-amz-object-lock-legal-hold"];
    }
    if (output.headers["x-amz-delete-marker"] !== undefined) {
        contents.DeleteMarker = output.headers["x-amz-delete-marker"] === "true";
    }
    if (output.headers["x-amz-storage-class"] !== undefined) {
        contents.StorageClass = output.headers["x-amz-storage-class"];
    }
    if (output.headers["content-encoding"] !== undefined) {
        contents.ContentEncoding = output.headers["content-encoding"];
    }
    if (output.headers["x-amz-restore"] !== undefined) {
        contents.Restore = output.headers["x-amz-restore"];
    }
    if (output.headers["x-amz-website-redirect-location"] !== undefined) {
        contents.WebsiteRedirectLocation = output.headers["x-amz-website-redirect-location"];
    }
    if (output.headers["x-amz-server-side-encryption"] !== undefined) {
        contents.ServerSideEncryption = output.headers["x-amz-server-side-encryption"];
    }
    if (output.headers["x-amz-mp-parts-count"] !== undefined) {
        contents.PartsCount = parseInt(output.headers["x-amz-mp-parts-count"], 10);
    }
    if (output.headers["x-amz-server-side-encryption-customer-algorithm"] !== undefined) {
        contents.SSECustomerAlgorithm = output.headers["x-amz-server-side-encryption-customer-algorithm"];
    }
    if (output.headers["accept-ranges"] !== undefined) {
        contents.AcceptRanges = output.headers["accept-ranges"];
    }
    if (output.headers["x-amz-version-id"] !== undefined) {
        contents.VersionId = output.headers["x-amz-version-id"];
    }
    if (output.headers["expires"] !== undefined) {
        contents.Expires = new Date(output.headers["expires"]);
    }
    if (output.headers["x-amz-expiration"] !== undefined) {
        contents.Expiration = output.headers["x-amz-expiration"];
    }
    if (output.headers["x-amz-missing-meta"] !== undefined) {
        contents.MissingMeta = parseInt(output.headers["x-amz-missing-meta"], 10);
    }
    if (output.headers["x-amz-replication-status"] !== undefined) {
        contents.ReplicationStatus = output.headers["x-amz-replication-status"];
    }
    if (output.headers["x-amz-tagging-count"] !== undefined) {
        contents.TagCount = parseInt(output.headers["x-amz-tagging-count"], 10);
    }
    if (output.headers["x-amz-server-side-encryption-customer-key-md5"] !== undefined) {
        contents.SSECustomerKeyMD5 = output.headers["x-amz-server-side-encryption-customer-key-md5"];
    }
    if (output.headers["last-modified"] !== undefined) {
        contents.LastModified = new Date(output.headers["last-modified"]);
    }
    if (output.headers["etag"] !== undefined) {
        contents.ETag = output.headers["etag"];
    }
    if (output.headers["x-amz-request-charged"] !== undefined) {
        contents.RequestCharged = output.headers["x-amz-request-charged"];
    }
    Object.keys(output.headers).forEach((header) => {
        if (contents.Metadata === undefined) {
            contents.Metadata = {};
        }
        if (header.startsWith("x-amz-meta-")) {
            contents.Metadata[header.substring(11)] = output.headers[header];
        }
    });
    const data = output.body;
    contents.Body = data;
    return Promise.resolve(contents);
};
const deserializeAws_restXmlGetObjectCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context),
    };
    let response;
    let errorCode = "UnknownError";
    errorCode = loadRestXmlErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        case "NoSuchKey":
        case "com.amazonaws.s3#NoSuchKey":
            response = {
                ...(await deserializeAws_restXmlNoSuchKeyResponse(parsedOutput)),
                name: errorCode,
                $metadata: deserializeMetadata(output),
            };
            break;
        default:
            const parsedBody = parsedOutput.body;
            errorCode = parsedBody.code || parsedBody.Code || errorCode;
            response = {
                ...parsedBody,
                name: `${errorCode}`,
                message: parsedBody.message || parsedBody.Message || errorCode,
                $fault: "client",
                $metadata: deserializeMetadata(output),
            };
    }
    const message = response.message || response.Message || errorCode;
    response.message = message;
    delete response.Message;
    return Promise.reject(Object.assign(new Error(message), response));
};
const deserializeAws_restXmlPutObjectCommand = async (output, context) => {
    if (output.statusCode !== 200 && output.statusCode >= 300) {
        return deserializeAws_restXmlPutObjectCommandError(output, context);
    }
    const contents = {
        $metadata: deserializeMetadata(output),
        ETag: undefined,
        Expiration: undefined,
        RequestCharged: undefined,
        SSECustomerAlgorithm: undefined,
        SSECustomerKeyMD5: undefined,
        SSEKMSEncryptionContext: undefined,
        SSEKMSKeyId: undefined,
        ServerSideEncryption: undefined,
        VersionId: undefined,
    };
    if (output.headers["x-amz-server-side-encryption-context"] !== undefined) {
        contents.SSEKMSEncryptionContext = output.headers["x-amz-server-side-encryption-context"];
    }
    if (output.headers["x-amz-expiration"] !== undefined) {
        contents.Expiration = output.headers["x-amz-expiration"];
    }
    if (output.headers["x-amz-server-side-encryption-customer-key-md5"] !== undefined) {
        contents.SSECustomerKeyMD5 = output.headers["x-amz-server-side-encryption-customer-key-md5"];
    }
    if (output.headers["etag"] !== undefined) {
        contents.ETag = output.headers["etag"];
    }
    if (output.headers["x-amz-server-side-encryption-customer-algorithm"] !== undefined) {
        contents.SSECustomerAlgorithm = output.headers["x-amz-server-side-encryption-customer-algorithm"];
    }
    if (output.headers["x-amz-version-id"] !== undefined) {
        contents.VersionId = output.headers["x-amz-version-id"];
    }
    if (output.headers["x-amz-request-charged"] !== undefined) {
        contents.RequestCharged = output.headers["x-amz-request-charged"];
    }
    if (output.headers["x-amz-server-side-encryption-aws-kms-key-id"] !== undefined) {
        contents.SSEKMSKeyId = output.headers["x-amz-server-side-encryption-aws-kms-key-id"];
    }
    if (output.headers["x-amz-server-side-encryption"] !== undefined) {
        contents.ServerSideEncryption = output.headers["x-amz-server-side-encryption"];
    }
    await collectBody(output.body, context);
    return Promise.resolve(contents);
};
const deserializeAws_restXmlPutObjectCommandError = async (output, context) => {
    const parsedOutput = {
        ...output,
        body: await parseBody(output.body, context),
    };
    let response;
    let errorCode = "UnknownError";
    errorCode = loadRestXmlErrorCode(output, parsedOutput.body);
    switch (errorCode) {
        default:
            const parsedBody = parsedOutput.body;
            errorCode = parsedBody.code || parsedBody.Code || errorCode;
            response = {
                ...parsedBody,
                name: `${errorCode}`,
                message: parsedBody.message || parsedBody.Message || errorCode,
                $fault: "client",
                $metadata: deserializeMetadata(output),
            };
    }
    const message = response.message || response.Message || errorCode;
    response.message = message;
    delete response.Message;
    return Promise.reject(Object.assign(new Error(message), response));
};
const deserializeAws_restXmlNoSuchKeyResponse = async (parsedOutput, context) => {
    const contents = {
        name: "NoSuchKey",
        $fault: "client",
        $metadata: deserializeMetadata(parsedOutput),
    };
    const data = parsedOutput.body;
    return contents;
};
const deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    httpHeaders: output.headers,
    requestId: output.headers["x-amzn-requestid"],
});
// Collect low-level response body stream to Uint8Array.
const collectBody = (streamBody = new Uint8Array(), context) => {
    if (streamBody instanceof Uint8Array) {
        return Promise.resolve(streamBody);
    }
    return context.streamCollector(streamBody) || Promise.resolve(new Uint8Array());
};
// Encode Uint8Array data into string with utf-8.
const collectBodyString = (streamBody, context) => collectBody(streamBody, context).then((body) => context.utf8Encoder(body));
const isSerializableHeaderValue = (value) => value !== undefined &&
    value !== "" &&
    (!Object.getOwnPropertyNames(value).includes("length") || value.length != 0) &&
    (!Object.getOwnPropertyNames(value).includes("size") || value.size != 0);
const decodeEscapedXML = (str) => str
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<");
const parseBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        const parsedObj = parser.parse(encoded, {
            attributeNamePrefix: "",
            ignoreAttributes: false,
            parseNodeValue: false,
            tagValueProcessor: (val, tagName) => decodeEscapedXML(val),
        });
        const textNodeName = "#text";
        const key = Object.keys(parsedObj)[0];
        const parsedObjToReturn = parsedObj[key];
        if (parsedObjToReturn[textNodeName]) {
            parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
            delete parsedObjToReturn[textNodeName];
        }
        return getValueFromTextNode(parsedObjToReturn);
    }
    return {};
});
const loadRestXmlErrorCode = (output, data) => {
    if (data.Code !== undefined) {
        return data.Code;
    }
    if (output.statusCode == 404) {
        return "NotFound";
    }
    return "";
};

var deserializerMiddleware = function (options, deserializer) { return function (next, context) { return function (args) { return __awaiter(void 0, void 0, void 0, function () {
    var logger, outputFilterSensitiveLog, response, parsed, $metadata, outputWithoutMetadata;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                logger = context.logger, outputFilterSensitiveLog = context.outputFilterSensitiveLog;
                return [4 /*yield*/, next(args)];
            case 1:
                response = (_a.sent()).response;
                if (typeof (logger === null || logger === void 0 ? void 0 : logger.debug) === "function") {
                    logger.debug({
                        httpResponse: response,
                    });
                }
                return [4 /*yield*/, deserializer(response, options)];
            case 2:
                parsed = _a.sent();
                $metadata = parsed.$metadata, outputWithoutMetadata = __rest(parsed, ["$metadata"]);
                if (typeof (logger === null || logger === void 0 ? void 0 : logger.info) === "function") {
                    logger.info({
                        output: outputFilterSensitiveLog(outputWithoutMetadata),
                    });
                }
                return [2 /*return*/, {
                        response: response,
                        output: parsed,
                    }];
        }
    });
}); }; }; };

var serializerMiddleware = function (options, serializer) { return function (next, context) { return function (args) { return __awaiter(void 0, void 0, void 0, function () {
    var logger, inputFilterSensitiveLog, request;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                logger = context.logger, inputFilterSensitiveLog = context.inputFilterSensitiveLog;
                if (typeof (logger === null || logger === void 0 ? void 0 : logger.info) === "function") {
                    logger.info({
                        input: inputFilterSensitiveLog(args.input),
                    });
                }
                return [4 /*yield*/, serializer(args.input, options)];
            case 1:
                request = _a.sent();
                if (typeof (logger === null || logger === void 0 ? void 0 : logger.debug) === "function") {
                    logger.debug({
                        httpRequest: request,
                    });
                }
                return [2 /*return*/, next(__assign(__assign({}, args), { request: request }))];
        }
    });
}); }; }; };

var deserializerMiddlewareOption = {
    name: "deserializerMiddleware",
    step: "deserialize",
    tags: ["DESERIALIZER"],
};
var serializerMiddlewareOption = {
    name: "serializerMiddleware",
    step: "serialize",
    tags: ["SERIALIZER"],
};
function getSerdePlugin(config, serializer, deserializer) {
    return {
        applyToStack: function (commandStack) {
            commandStack.add(deserializerMiddleware(config, deserializer), deserializerMiddlewareOption);
            commandStack.add(serializerMiddleware(config, serializer), serializerMiddlewareOption);
        },
    };
}

function ssecMiddleware(options) {
    var _this = this;
    return function (next) { return function (args) { return __awaiter(_this, void 0, void 0, function () {
        var input, properties, properties_1, properties_1_1, prop, value, valueView, encoded, hash, _a, _b, _c, _d, e_1_1;
        var e_1, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    input = __assign({}, args.input);
                    properties = [
                        {
                            target: "SSECustomerKey",
                            hash: "SSECustomerKeyMD5",
                        },
                        {
                            target: "CopySourceSSECustomerKey",
                            hash: "CopySourceSSECustomerKeyMD5",
                        },
                    ];
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 6, 7, 8]);
                    properties_1 = __values(properties), properties_1_1 = properties_1.next();
                    _g.label = 2;
                case 2:
                    if (!!properties_1_1.done) return [3 /*break*/, 5];
                    prop = properties_1_1.value;
                    value = input[prop.target];
                    if (!value) return [3 /*break*/, 4];
                    valueView = ArrayBuffer.isView(value)
                        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
                        : typeof value === "string"
                            ? options.utf8Decoder(value)
                            : new Uint8Array(value);
                    encoded = options.base64Encoder(valueView);
                    hash = new options.md5();
                    hash.update(valueView);
                    _a = [__assign({}, input)];
                    _f = {}, _f[prop.target] = encoded;
                    _b = prop.hash;
                    _d = (_c = options).base64Encoder;
                    return [4 /*yield*/, hash.digest()];
                case 3:
                    input = __assign.apply(void 0, _a.concat([(_f[_b] = _d.apply(_c, [_g.sent()]), _f)]));
                    _g.label = 4;
                case 4:
                    properties_1_1 = properties_1.next();
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 8];
                case 6:
                    e_1_1 = _g.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 8];
                case 7:
                    try {
                        if (properties_1_1 && !properties_1_1.done && (_e = properties_1.return)) _e.call(properties_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/, next(__assign(__assign({}, args), { input: input }))];
            }
        });
    }); }; };
}
var ssecMiddlewareOptions = {
    name: "ssecMiddleware",
    step: "initialize",
    tags: ["SSE"],
};
var getSsecPlugin = function (config) { return ({
    applyToStack: function (clientStack) {
        clientStack.add(ssecMiddleware(config), ssecMiddlewareOptions);
    },
}); };

class PutObjectCommand extends Command {
    // Start section: command_properties
    // End section: command_properties
    constructor(input) {
        // Start section: command_constructor
        super();
        this.input = input;
        // End section: command_constructor
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getSsecPlugin(configuration));
        this.middlewareStack.use(getBucketEndpointPlugin(configuration));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const handlerExecutionContext = {
            logger,
            clientName: "S3Client",
            commandName: "PutObjectCommand",
            inputFilterSensitiveLog: PutObjectRequest.filterSensitiveLog,
            outputFilterSensitiveLog: PutObjectOutput.filterSensitiveLog,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return serializeAws_restXmlPutObjectCommand(input, context);
    }
    deserialize(output, context) {
        return deserializeAws_restXmlPutObjectCommand(output, context);
    }
}

var PutObjectCommand$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  PutObjectCommand: PutObjectCommand
});

class GetObjectCommand extends Command {
    // Start section: command_properties
    // End section: command_properties
    constructor(input) {
        // Start section: command_constructor
        super();
        this.input = input;
        // End section: command_constructor
    }
    resolveMiddleware(clientStack, configuration, options) {
        this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
        this.middlewareStack.use(getSsecPlugin(configuration));
        this.middlewareStack.use(getBucketEndpointPlugin(configuration));
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const handlerExecutionContext = {
            logger,
            clientName: "S3Client",
            commandName: "GetObjectCommand",
            inputFilterSensitiveLog: GetObjectRequest.filterSensitiveLog,
            outputFilterSensitiveLog: GetObjectOutput.filterSensitiveLog,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
    serialize(input, context) {
        return serializeAws_restXmlGetObjectCommand(input, context);
    }
    deserialize(output, context) {
        return deserializeAws_restXmlGetObjectCommand(output, context);
    }
}

var GetObjectCommand$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  GetObjectCommand: GetObjectCommand
});

const {PassThrough: PassThroughStream} = Stream__default['default'];

var bufferStream = options => {
	options = {...options};

	const {array} = options;
	let {encoding} = options;
	const isBuffer = encoding === 'buffer';
	let objectMode = false;

	if (array) {
		objectMode = !(encoding || isBuffer);
	} else {
		encoding = encoding || 'utf8';
	}

	if (isBuffer) {
		encoding = null;
	}

	const stream = new PassThroughStream({objectMode});

	if (encoding) {
		stream.setEncoding(encoding);
	}

	let length = 0;
	const chunks = [];

	stream.on('data', chunk => {
		chunks.push(chunk);

		if (objectMode) {
			length = chunks.length;
		} else {
			length += chunk.length;
		}
	});

	stream.getBufferedValue = () => {
		if (array) {
			return chunks;
		}

		return isBuffer ? Buffer.concat(chunks, length) : chunks.join('');
	};

	stream.getBufferedLength = () => length;

	return stream;
};

const {constants: BufferConstants} = buffer__default['default'];

const {promisify} = util__default['default'];


const streamPipelinePromisified = promisify(Stream__default['default'].pipeline);

class MaxBufferError extends Error {
	constructor() {
		super('maxBuffer exceeded');
		this.name = 'MaxBufferError';
	}
}

async function getStream(inputStream, options) {
	if (!inputStream) {
		throw new Error('Expected a stream');
	}

	options = {
		maxBuffer: Infinity,
		...options
	};

	const {maxBuffer} = options;
	const stream = bufferStream(options);

	await new Promise((resolve, reject) => {
		const rejectPromise = error => {
			// Don't retrieve an oversized buffer.
			if (error && stream.getBufferedLength() <= BufferConstants.MAX_LENGTH) {
				error.bufferedData = stream.getBufferedValue();
			}

			reject(error);
		};

		(async () => {
			try {
				await streamPipelinePromisified(inputStream, stream);
				resolve();
			} catch (error) {
				rejectPromise(error);
			}
		})();

		stream.on('data', () => {
			if (stream.getBufferedLength() > maxBuffer) {
				rejectPromise(new MaxBufferError());
			}
		});
	});

	return stream.getBufferedValue();
}

var getStream_1 = getStream;
var buffer = (stream, options) => getStream(stream, {...options, encoding: 'buffer'});
var array = (stream, options) => getStream(stream, {...options, array: true});
var MaxBufferError_1 = MaxBufferError;
getStream_1.buffer = buffer;
getStream_1.array = array;
getStream_1.MaxBufferError = MaxBufferError_1;

var index$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.assign(/*#__PURE__*/Object.create(null), getStream_1, {
  'default': getStream_1,
  buffer: buffer,
  array: array,
  MaxBufferError: MaxBufferError_1
}));

exports.handler = handler$1;
