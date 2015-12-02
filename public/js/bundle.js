require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*!
  Copyright (c) 2015 Jed Watson.
  Licensed under the MIT License (MIT), see
  http://jedwatson.github.io/classnames
*/
/* global define */

(function () {
  'use strict';

  var hasOwn = {}.hasOwnProperty;

  function classNames () {
    var classes = '';

    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
      if (!arg) continue;

      var argType = typeof arg;

      if (argType === 'string' || argType === 'number') {
        classes += ' ' + arg;
      } else if (Array.isArray(arg)) {
        classes += ' ' + classNames.apply(null, arg);
      } else if (argType === 'object') {
        for (var key in arg) {
          if (hasOwn.call(arg, key) && arg[key]) {
            classes += ' ' + key;
          }
        }
      }
    }

    return classes.substr(1);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = classNames;
  } else if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {
    // register as 'classnames', consistent with npm package name
    define('classnames', [], function () {
      return classNames;
    });
  } else {
    window.classNames = classNames;
  }
}());

},{}],2:[function(require,module,exports){
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

// This is CodeMirror (http://codemirror.net), a code editor
// implemented in JavaScript on top of the browser's DOM.
//
// You can find some technical background for some of the code below
// at http://marijnhaverbeke.nl/blog/#cm-internals .

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    module.exports = mod();
  else if (typeof define == "function" && define.amd) // AMD
    return define([], mod);
  else // Plain browser env
    this.CodeMirror = mod();
})(function() {
  "use strict";

  // BROWSER SNIFFING

  // Kludges for bugs and behavior differences that can't be feature
  // detected are enabled based on userAgent etc sniffing.
  var userAgent = navigator.userAgent;
  var platform = navigator.platform;

  var gecko = /gecko\/\d/i.test(userAgent);
  var ie_upto10 = /MSIE \d/.test(userAgent);
  var ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(userAgent);
  var ie = ie_upto10 || ie_11up;
  var ie_version = ie && (ie_upto10 ? document.documentMode || 6 : ie_11up[1]);
  var webkit = /WebKit\//.test(userAgent);
  var qtwebkit = webkit && /Qt\/\d+\.\d+/.test(userAgent);
  var chrome = /Chrome\//.test(userAgent);
  var presto = /Opera\//.test(userAgent);
  var safari = /Apple Computer/.test(navigator.vendor);
  var mac_geMountainLion = /Mac OS X 1\d\D([8-9]|\d\d)\D/.test(userAgent);
  var phantom = /PhantomJS/.test(userAgent);

  var ios = /AppleWebKit/.test(userAgent) && /Mobile\/\w+/.test(userAgent);
  // This is woefully incomplete. Suggestions for alternative methods welcome.
  var mobile = ios || /Android|webOS|BlackBerry|Opera Mini|Opera Mobi|IEMobile/i.test(userAgent);
  var mac = ios || /Mac/.test(platform);
  var windows = /win/i.test(platform);

  var presto_version = presto && userAgent.match(/Version\/(\d*\.\d*)/);
  if (presto_version) presto_version = Number(presto_version[1]);
  if (presto_version && presto_version >= 15) { presto = false; webkit = true; }
  // Some browsers use the wrong event properties to signal cmd/ctrl on OS X
  var flipCtrlCmd = mac && (qtwebkit || presto && (presto_version == null || presto_version < 12.11));
  var captureRightClick = gecko || (ie && ie_version >= 9);

  // Optimize some code when these features are not used.
  var sawReadOnlySpans = false, sawCollapsedSpans = false;

  // EDITOR CONSTRUCTOR

  // A CodeMirror instance represents an editor. This is the object
  // that user code is usually dealing with.

  function CodeMirror(place, options) {
    if (!(this instanceof CodeMirror)) return new CodeMirror(place, options);

    this.options = options = options ? copyObj(options) : {};
    // Determine effective options based on given values and defaults.
    copyObj(defaults, options, false);
    setGuttersForLineNumbers(options);

    var doc = options.value;
    if (typeof doc == "string") doc = new Doc(doc, options.mode, null, options.lineSeparator);
    this.doc = doc;

    var input = new CodeMirror.inputStyles[options.inputStyle](this);
    var display = this.display = new Display(place, doc, input);
    display.wrapper.CodeMirror = this;
    updateGutters(this);
    themeChanged(this);
    if (options.lineWrapping)
      this.display.wrapper.className += " CodeMirror-wrap";
    if (options.autofocus && !mobile) display.input.focus();
    initScrollbars(this);

    this.state = {
      keyMaps: [],  // stores maps added by addKeyMap
      overlays: [], // highlighting overlays, as added by addOverlay
      modeGen: 0,   // bumped when mode/overlay changes, used to invalidate highlighting info
      overwrite: false,
      delayingBlurEvent: false,
      focused: false,
      suppressEdits: false, // used to disable editing during key handlers when in readOnly mode
      pasteIncoming: false, cutIncoming: false, // help recognize paste/cut edits in input.poll
      selectingText: false,
      draggingText: false,
      highlight: new Delayed(), // stores highlight worker timeout
      keySeq: null,  // Unfinished key sequence
      specialChars: null
    };

    var cm = this;

    // Override magic textarea content restore that IE sometimes does
    // on our hidden textarea on reload
    if (ie && ie_version < 11) setTimeout(function() { cm.display.input.reset(true); }, 20);

    registerEventHandlers(this);
    ensureGlobalHandlers();

    startOperation(this);
    this.curOp.forceUpdate = true;
    attachDoc(this, doc);

    if ((options.autofocus && !mobile) || cm.hasFocus())
      setTimeout(bind(onFocus, this), 20);
    else
      onBlur(this);

    for (var opt in optionHandlers) if (optionHandlers.hasOwnProperty(opt))
      optionHandlers[opt](this, options[opt], Init);
    maybeUpdateLineNumberWidth(this);
    if (options.finishInit) options.finishInit(this);
    for (var i = 0; i < initHooks.length; ++i) initHooks[i](this);
    endOperation(this);
    // Suppress optimizelegibility in Webkit, since it breaks text
    // measuring on line wrapping boundaries.
    if (webkit && options.lineWrapping &&
        getComputedStyle(display.lineDiv).textRendering == "optimizelegibility")
      display.lineDiv.style.textRendering = "auto";
  }

  // DISPLAY CONSTRUCTOR

  // The display handles the DOM integration, both for input reading
  // and content drawing. It holds references to DOM nodes and
  // display-related state.

  function Display(place, doc, input) {
    var d = this;
    this.input = input;

    // Covers bottom-right square when both scrollbars are present.
    d.scrollbarFiller = elt("div", null, "CodeMirror-scrollbar-filler");
    d.scrollbarFiller.setAttribute("cm-not-content", "true");
    // Covers bottom of gutter when coverGutterNextToScrollbar is on
    // and h scrollbar is present.
    d.gutterFiller = elt("div", null, "CodeMirror-gutter-filler");
    d.gutterFiller.setAttribute("cm-not-content", "true");
    // Will contain the actual code, positioned to cover the viewport.
    d.lineDiv = elt("div", null, "CodeMirror-code");
    // Elements are added to these to represent selection and cursors.
    d.selectionDiv = elt("div", null, null, "position: relative; z-index: 1");
    d.cursorDiv = elt("div", null, "CodeMirror-cursors");
    // A visibility: hidden element used to find the size of things.
    d.measure = elt("div", null, "CodeMirror-measure");
    // When lines outside of the viewport are measured, they are drawn in this.
    d.lineMeasure = elt("div", null, "CodeMirror-measure");
    // Wraps everything that needs to exist inside the vertically-padded coordinate system
    d.lineSpace = elt("div", [d.measure, d.lineMeasure, d.selectionDiv, d.cursorDiv, d.lineDiv],
                      null, "position: relative; outline: none");
    // Moved around its parent to cover visible view.
    d.mover = elt("div", [elt("div", [d.lineSpace], "CodeMirror-lines")], null, "position: relative");
    // Set to the height of the document, allowing scrolling.
    d.sizer = elt("div", [d.mover], "CodeMirror-sizer");
    d.sizerWidth = null;
    // Behavior of elts with overflow: auto and padding is
    // inconsistent across browsers. This is used to ensure the
    // scrollable area is big enough.
    d.heightForcer = elt("div", null, null, "position: absolute; height: " + scrollerGap + "px; width: 1px;");
    // Will contain the gutters, if any.
    d.gutters = elt("div", null, "CodeMirror-gutters");
    d.lineGutter = null;
    // Actual scrollable element.
    d.scroller = elt("div", [d.sizer, d.heightForcer, d.gutters], "CodeMirror-scroll");
    d.scroller.setAttribute("tabIndex", "-1");
    // The element in which the editor lives.
    d.wrapper = elt("div", [d.scrollbarFiller, d.gutterFiller, d.scroller], "CodeMirror");

    // Work around IE7 z-index bug (not perfect, hence IE7 not really being supported)
    if (ie && ie_version < 8) { d.gutters.style.zIndex = -1; d.scroller.style.paddingRight = 0; }
    if (!webkit && !(gecko && mobile)) d.scroller.draggable = true;

    if (place) {
      if (place.appendChild) place.appendChild(d.wrapper);
      else place(d.wrapper);
    }

    // Current rendered range (may be bigger than the view window).
    d.viewFrom = d.viewTo = doc.first;
    d.reportedViewFrom = d.reportedViewTo = doc.first;
    // Information about the rendered lines.
    d.view = [];
    d.renderedView = null;
    // Holds info about a single rendered line when it was rendered
    // for measurement, while not in view.
    d.externalMeasured = null;
    // Empty space (in pixels) above the view
    d.viewOffset = 0;
    d.lastWrapHeight = d.lastWrapWidth = 0;
    d.updateLineNumbers = null;

    d.nativeBarWidth = d.barHeight = d.barWidth = 0;
    d.scrollbarsClipped = false;

    // Used to only resize the line number gutter when necessary (when
    // the amount of lines crosses a boundary that makes its width change)
    d.lineNumWidth = d.lineNumInnerWidth = d.lineNumChars = null;
    // Set to true when a non-horizontal-scrolling line widget is
    // added. As an optimization, line widget aligning is skipped when
    // this is false.
    d.alignWidgets = false;

    d.cachedCharWidth = d.cachedTextHeight = d.cachedPaddingH = null;

    // Tracks the maximum line length so that the horizontal scrollbar
    // can be kept static when scrolling.
    d.maxLine = null;
    d.maxLineLength = 0;
    d.maxLineChanged = false;

    // Used for measuring wheel scrolling granularity
    d.wheelDX = d.wheelDY = d.wheelStartX = d.wheelStartY = null;

    // True when shift is held down.
    d.shift = false;

    // Used to track whether anything happened since the context menu
    // was opened.
    d.selForContextMenu = null;

    d.activeTouch = null;

    input.init(d);
  }

  // STATE UPDATES

  // Used to get the editor into a consistent state again when options change.

  function loadMode(cm) {
    cm.doc.mode = CodeMirror.getMode(cm.options, cm.doc.modeOption);
    resetModeState(cm);
  }

  function resetModeState(cm) {
    cm.doc.iter(function(line) {
      if (line.stateAfter) line.stateAfter = null;
      if (line.styles) line.styles = null;
    });
    cm.doc.frontier = cm.doc.first;
    startWorker(cm, 100);
    cm.state.modeGen++;
    if (cm.curOp) regChange(cm);
  }

  function wrappingChanged(cm) {
    if (cm.options.lineWrapping) {
      addClass(cm.display.wrapper, "CodeMirror-wrap");
      cm.display.sizer.style.minWidth = "";
      cm.display.sizerWidth = null;
    } else {
      rmClass(cm.display.wrapper, "CodeMirror-wrap");
      findMaxLine(cm);
    }
    estimateLineHeights(cm);
    regChange(cm);
    clearCaches(cm);
    setTimeout(function(){updateScrollbars(cm);}, 100);
  }

  // Returns a function that estimates the height of a line, to use as
  // first approximation until the line becomes visible (and is thus
  // properly measurable).
  function estimateHeight(cm) {
    var th = textHeight(cm.display), wrapping = cm.options.lineWrapping;
    var perLine = wrapping && Math.max(5, cm.display.scroller.clientWidth / charWidth(cm.display) - 3);
    return function(line) {
      if (lineIsHidden(cm.doc, line)) return 0;

      var widgetsHeight = 0;
      if (line.widgets) for (var i = 0; i < line.widgets.length; i++) {
        if (line.widgets[i].height) widgetsHeight += line.widgets[i].height;
      }

      if (wrapping)
        return widgetsHeight + (Math.ceil(line.text.length / perLine) || 1) * th;
      else
        return widgetsHeight + th;
    };
  }

  function estimateLineHeights(cm) {
    var doc = cm.doc, est = estimateHeight(cm);
    doc.iter(function(line) {
      var estHeight = est(line);
      if (estHeight != line.height) updateLineHeight(line, estHeight);
    });
  }

  function themeChanged(cm) {
    cm.display.wrapper.className = cm.display.wrapper.className.replace(/\s*cm-s-\S+/g, "") +
      cm.options.theme.replace(/(^|\s)\s*/g, " cm-s-");
    clearCaches(cm);
  }

  function guttersChanged(cm) {
    updateGutters(cm);
    regChange(cm);
    setTimeout(function(){alignHorizontally(cm);}, 20);
  }

  // Rebuild the gutter elements, ensure the margin to the left of the
  // code matches their width.
  function updateGutters(cm) {
    var gutters = cm.display.gutters, specs = cm.options.gutters;
    removeChildren(gutters);
    for (var i = 0; i < specs.length; ++i) {
      var gutterClass = specs[i];
      var gElt = gutters.appendChild(elt("div", null, "CodeMirror-gutter " + gutterClass));
      if (gutterClass == "CodeMirror-linenumbers") {
        cm.display.lineGutter = gElt;
        gElt.style.width = (cm.display.lineNumWidth || 1) + "px";
      }
    }
    gutters.style.display = i ? "" : "none";
    updateGutterSpace(cm);
  }

  function updateGutterSpace(cm) {
    var width = cm.display.gutters.offsetWidth;
    cm.display.sizer.style.marginLeft = width + "px";
  }

  // Compute the character length of a line, taking into account
  // collapsed ranges (see markText) that might hide parts, and join
  // other lines onto it.
  function lineLength(line) {
    if (line.height == 0) return 0;
    var len = line.text.length, merged, cur = line;
    while (merged = collapsedSpanAtStart(cur)) {
      var found = merged.find(0, true);
      cur = found.from.line;
      len += found.from.ch - found.to.ch;
    }
    cur = line;
    while (merged = collapsedSpanAtEnd(cur)) {
      var found = merged.find(0, true);
      len -= cur.text.length - found.from.ch;
      cur = found.to.line;
      len += cur.text.length - found.to.ch;
    }
    return len;
  }

  // Find the longest line in the document.
  function findMaxLine(cm) {
    var d = cm.display, doc = cm.doc;
    d.maxLine = getLine(doc, doc.first);
    d.maxLineLength = lineLength(d.maxLine);
    d.maxLineChanged = true;
    doc.iter(function(line) {
      var len = lineLength(line);
      if (len > d.maxLineLength) {
        d.maxLineLength = len;
        d.maxLine = line;
      }
    });
  }

  // Make sure the gutters options contains the element
  // "CodeMirror-linenumbers" when the lineNumbers option is true.
  function setGuttersForLineNumbers(options) {
    var found = indexOf(options.gutters, "CodeMirror-linenumbers");
    if (found == -1 && options.lineNumbers) {
      options.gutters = options.gutters.concat(["CodeMirror-linenumbers"]);
    } else if (found > -1 && !options.lineNumbers) {
      options.gutters = options.gutters.slice(0);
      options.gutters.splice(found, 1);
    }
  }

  // SCROLLBARS

  // Prepare DOM reads needed to update the scrollbars. Done in one
  // shot to minimize update/measure roundtrips.
  function measureForScrollbars(cm) {
    var d = cm.display, gutterW = d.gutters.offsetWidth;
    var docH = Math.round(cm.doc.height + paddingVert(cm.display));
    return {
      clientHeight: d.scroller.clientHeight,
      viewHeight: d.wrapper.clientHeight,
      scrollWidth: d.scroller.scrollWidth, clientWidth: d.scroller.clientWidth,
      viewWidth: d.wrapper.clientWidth,
      barLeft: cm.options.fixedGutter ? gutterW : 0,
      docHeight: docH,
      scrollHeight: docH + scrollGap(cm) + d.barHeight,
      nativeBarWidth: d.nativeBarWidth,
      gutterWidth: gutterW
    };
  }

  function NativeScrollbars(place, scroll, cm) {
    this.cm = cm;
    var vert = this.vert = elt("div", [elt("div", null, null, "min-width: 1px")], "CodeMirror-vscrollbar");
    var horiz = this.horiz = elt("div", [elt("div", null, null, "height: 100%; min-height: 1px")], "CodeMirror-hscrollbar");
    place(vert); place(horiz);

    on(vert, "scroll", function() {
      if (vert.clientHeight) scroll(vert.scrollTop, "vertical");
    });
    on(horiz, "scroll", function() {
      if (horiz.clientWidth) scroll(horiz.scrollLeft, "horizontal");
    });

    this.checkedZeroWidth = false;
    // Need to set a minimum width to see the scrollbar on IE7 (but must not set it on IE8).
    if (ie && ie_version < 8) this.horiz.style.minHeight = this.vert.style.minWidth = "18px";
  }

  NativeScrollbars.prototype = copyObj({
    update: function(measure) {
      var needsH = measure.scrollWidth > measure.clientWidth + 1;
      var needsV = measure.scrollHeight > measure.clientHeight + 1;
      var sWidth = measure.nativeBarWidth;

      if (needsV) {
        this.vert.style.display = "block";
        this.vert.style.bottom = needsH ? sWidth + "px" : "0";
        var totalHeight = measure.viewHeight - (needsH ? sWidth : 0);
        // A bug in IE8 can cause this value to be negative, so guard it.
        this.vert.firstChild.style.height =
          Math.max(0, measure.scrollHeight - measure.clientHeight + totalHeight) + "px";
      } else {
        this.vert.style.display = "";
        this.vert.firstChild.style.height = "0";
      }

      if (needsH) {
        this.horiz.style.display = "block";
        this.horiz.style.right = needsV ? sWidth + "px" : "0";
        this.horiz.style.left = measure.barLeft + "px";
        var totalWidth = measure.viewWidth - measure.barLeft - (needsV ? sWidth : 0);
        this.horiz.firstChild.style.width =
          (measure.scrollWidth - measure.clientWidth + totalWidth) + "px";
      } else {
        this.horiz.style.display = "";
        this.horiz.firstChild.style.width = "0";
      }

      if (!this.checkedZeroWidth && measure.clientHeight > 0) {
        if (sWidth == 0) this.zeroWidthHack();
        this.checkedZeroWidth = true;
      }

      return {right: needsV ? sWidth : 0, bottom: needsH ? sWidth : 0};
    },
    setScrollLeft: function(pos) {
      if (this.horiz.scrollLeft != pos) this.horiz.scrollLeft = pos;
      if (this.disableHoriz) this.enableZeroWidthBar(this.horiz, this.disableHoriz);
    },
    setScrollTop: function(pos) {
      if (this.vert.scrollTop != pos) this.vert.scrollTop = pos;
      if (this.disableVert) this.enableZeroWidthBar(this.vert, this.disableVert);
    },
    zeroWidthHack: function() {
      var w = mac && !mac_geMountainLion ? "12px" : "18px";
      this.horiz.style.height = this.vert.style.width = w;
      this.horiz.style.pointerEvents = this.vert.style.pointerEvents = "none";
      this.disableHoriz = new Delayed;
      this.disableVert = new Delayed;
    },
    enableZeroWidthBar: function(bar, delay) {
      bar.style.pointerEvents = "auto";
      function maybeDisable() {
        // To find out whether the scrollbar is still visible, we
        // check whether the element under the pixel in the bottom
        // left corner of the scrollbar box is the scrollbar box
        // itself (when the bar is still visible) or its filler child
        // (when the bar is hidden). If it is still visible, we keep
        // it enabled, if it's hidden, we disable pointer events.
        var box = bar.getBoundingClientRect();
        var elt = document.elementFromPoint(box.left + 1, box.bottom - 1);
        if (elt != bar) bar.style.pointerEvents = "none";
        else delay.set(1000, maybeDisable);
      }
      delay.set(1000, maybeDisable);
    },
    clear: function() {
      var parent = this.horiz.parentNode;
      parent.removeChild(this.horiz);
      parent.removeChild(this.vert);
    }
  }, NativeScrollbars.prototype);

  function NullScrollbars() {}

  NullScrollbars.prototype = copyObj({
    update: function() { return {bottom: 0, right: 0}; },
    setScrollLeft: function() {},
    setScrollTop: function() {},
    clear: function() {}
  }, NullScrollbars.prototype);

  CodeMirror.scrollbarModel = {"native": NativeScrollbars, "null": NullScrollbars};

  function initScrollbars(cm) {
    if (cm.display.scrollbars) {
      cm.display.scrollbars.clear();
      if (cm.display.scrollbars.addClass)
        rmClass(cm.display.wrapper, cm.display.scrollbars.addClass);
    }

    cm.display.scrollbars = new CodeMirror.scrollbarModel[cm.options.scrollbarStyle](function(node) {
      cm.display.wrapper.insertBefore(node, cm.display.scrollbarFiller);
      // Prevent clicks in the scrollbars from killing focus
      on(node, "mousedown", function() {
        if (cm.state.focused) setTimeout(function() { cm.display.input.focus(); }, 0);
      });
      node.setAttribute("cm-not-content", "true");
    }, function(pos, axis) {
      if (axis == "horizontal") setScrollLeft(cm, pos);
      else setScrollTop(cm, pos);
    }, cm);
    if (cm.display.scrollbars.addClass)
      addClass(cm.display.wrapper, cm.display.scrollbars.addClass);
  }

  function updateScrollbars(cm, measure) {
    if (!measure) measure = measureForScrollbars(cm);
    var startWidth = cm.display.barWidth, startHeight = cm.display.barHeight;
    updateScrollbarsInner(cm, measure);
    for (var i = 0; i < 4 && startWidth != cm.display.barWidth || startHeight != cm.display.barHeight; i++) {
      if (startWidth != cm.display.barWidth && cm.options.lineWrapping)
        updateHeightsInViewport(cm);
      updateScrollbarsInner(cm, measureForScrollbars(cm));
      startWidth = cm.display.barWidth; startHeight = cm.display.barHeight;
    }
  }

  // Re-synchronize the fake scrollbars with the actual size of the
  // content.
  function updateScrollbarsInner(cm, measure) {
    var d = cm.display;
    var sizes = d.scrollbars.update(measure);

    d.sizer.style.paddingRight = (d.barWidth = sizes.right) + "px";
    d.sizer.style.paddingBottom = (d.barHeight = sizes.bottom) + "px";

    if (sizes.right && sizes.bottom) {
      d.scrollbarFiller.style.display = "block";
      d.scrollbarFiller.style.height = sizes.bottom + "px";
      d.scrollbarFiller.style.width = sizes.right + "px";
    } else d.scrollbarFiller.style.display = "";
    if (sizes.bottom && cm.options.coverGutterNextToScrollbar && cm.options.fixedGutter) {
      d.gutterFiller.style.display = "block";
      d.gutterFiller.style.height = sizes.bottom + "px";
      d.gutterFiller.style.width = measure.gutterWidth + "px";
    } else d.gutterFiller.style.display = "";
  }

  // Compute the lines that are visible in a given viewport (defaults
  // the the current scroll position). viewport may contain top,
  // height, and ensure (see op.scrollToPos) properties.
  function visibleLines(display, doc, viewport) {
    var top = viewport && viewport.top != null ? Math.max(0, viewport.top) : display.scroller.scrollTop;
    top = Math.floor(top - paddingTop(display));
    var bottom = viewport && viewport.bottom != null ? viewport.bottom : top + display.wrapper.clientHeight;

    var from = lineAtHeight(doc, top), to = lineAtHeight(doc, bottom);
    // Ensure is a {from: {line, ch}, to: {line, ch}} object, and
    // forces those lines into the viewport (if possible).
    if (viewport && viewport.ensure) {
      var ensureFrom = viewport.ensure.from.line, ensureTo = viewport.ensure.to.line;
      if (ensureFrom < from) {
        from = ensureFrom;
        to = lineAtHeight(doc, heightAtLine(getLine(doc, ensureFrom)) + display.wrapper.clientHeight);
      } else if (Math.min(ensureTo, doc.lastLine()) >= to) {
        from = lineAtHeight(doc, heightAtLine(getLine(doc, ensureTo)) - display.wrapper.clientHeight);
        to = ensureTo;
      }
    }
    return {from: from, to: Math.max(to, from + 1)};
  }

  // LINE NUMBERS

  // Re-align line numbers and gutter marks to compensate for
  // horizontal scrolling.
  function alignHorizontally(cm) {
    var display = cm.display, view = display.view;
    if (!display.alignWidgets && (!display.gutters.firstChild || !cm.options.fixedGutter)) return;
    var comp = compensateForHScroll(display) - display.scroller.scrollLeft + cm.doc.scrollLeft;
    var gutterW = display.gutters.offsetWidth, left = comp + "px";
    for (var i = 0; i < view.length; i++) if (!view[i].hidden) {
      if (cm.options.fixedGutter && view[i].gutter)
        view[i].gutter.style.left = left;
      var align = view[i].alignable;
      if (align) for (var j = 0; j < align.length; j++)
        align[j].style.left = left;
    }
    if (cm.options.fixedGutter)
      display.gutters.style.left = (comp + gutterW) + "px";
  }

  // Used to ensure that the line number gutter is still the right
  // size for the current document size. Returns true when an update
  // is needed.
  function maybeUpdateLineNumberWidth(cm) {
    if (!cm.options.lineNumbers) return false;
    var doc = cm.doc, last = lineNumberFor(cm.options, doc.first + doc.size - 1), display = cm.display;
    if (last.length != display.lineNumChars) {
      var test = display.measure.appendChild(elt("div", [elt("div", last)],
                                                 "CodeMirror-linenumber CodeMirror-gutter-elt"));
      var innerW = test.firstChild.offsetWidth, padding = test.offsetWidth - innerW;
      display.lineGutter.style.width = "";
      display.lineNumInnerWidth = Math.max(innerW, display.lineGutter.offsetWidth - padding) + 1;
      display.lineNumWidth = display.lineNumInnerWidth + padding;
      display.lineNumChars = display.lineNumInnerWidth ? last.length : -1;
      display.lineGutter.style.width = display.lineNumWidth + "px";
      updateGutterSpace(cm);
      return true;
    }
    return false;
  }

  function lineNumberFor(options, i) {
    return String(options.lineNumberFormatter(i + options.firstLineNumber));
  }

  // Computes display.scroller.scrollLeft + display.gutters.offsetWidth,
  // but using getBoundingClientRect to get a sub-pixel-accurate
  // result.
  function compensateForHScroll(display) {
    return display.scroller.getBoundingClientRect().left - display.sizer.getBoundingClientRect().left;
  }

  // DISPLAY DRAWING

  function DisplayUpdate(cm, viewport, force) {
    var display = cm.display;

    this.viewport = viewport;
    // Store some values that we'll need later (but don't want to force a relayout for)
    this.visible = visibleLines(display, cm.doc, viewport);
    this.editorIsHidden = !display.wrapper.offsetWidth;
    this.wrapperHeight = display.wrapper.clientHeight;
    this.wrapperWidth = display.wrapper.clientWidth;
    this.oldDisplayWidth = displayWidth(cm);
    this.force = force;
    this.dims = getDimensions(cm);
    this.events = [];
  }

  DisplayUpdate.prototype.signal = function(emitter, type) {
    if (hasHandler(emitter, type))
      this.events.push(arguments);
  };
  DisplayUpdate.prototype.finish = function() {
    for (var i = 0; i < this.events.length; i++)
      signal.apply(null, this.events[i]);
  };

  function maybeClipScrollbars(cm) {
    var display = cm.display;
    if (!display.scrollbarsClipped && display.scroller.offsetWidth) {
      display.nativeBarWidth = display.scroller.offsetWidth - display.scroller.clientWidth;
      display.heightForcer.style.height = scrollGap(cm) + "px";
      display.sizer.style.marginBottom = -display.nativeBarWidth + "px";
      display.sizer.style.borderRightWidth = scrollGap(cm) + "px";
      display.scrollbarsClipped = true;
    }
  }

  // Does the actual updating of the line display. Bails out
  // (returning false) when there is nothing to be done and forced is
  // false.
  function updateDisplayIfNeeded(cm, update) {
    var display = cm.display, doc = cm.doc;

    if (update.editorIsHidden) {
      resetView(cm);
      return false;
    }

    // Bail out if the visible area is already rendered and nothing changed.
    if (!update.force &&
        update.visible.from >= display.viewFrom && update.visible.to <= display.viewTo &&
        (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo) &&
        display.renderedView == display.view && countDirtyView(cm) == 0)
      return false;

    if (maybeUpdateLineNumberWidth(cm)) {
      resetView(cm);
      update.dims = getDimensions(cm);
    }

    // Compute a suitable new viewport (from & to)
    var end = doc.first + doc.size;
    var from = Math.max(update.visible.from - cm.options.viewportMargin, doc.first);
    var to = Math.min(end, update.visible.to + cm.options.viewportMargin);
    if (display.viewFrom < from && from - display.viewFrom < 20) from = Math.max(doc.first, display.viewFrom);
    if (display.viewTo > to && display.viewTo - to < 20) to = Math.min(end, display.viewTo);
    if (sawCollapsedSpans) {
      from = visualLineNo(cm.doc, from);
      to = visualLineEndNo(cm.doc, to);
    }

    var different = from != display.viewFrom || to != display.viewTo ||
      display.lastWrapHeight != update.wrapperHeight || display.lastWrapWidth != update.wrapperWidth;
    adjustView(cm, from, to);

    display.viewOffset = heightAtLine(getLine(cm.doc, display.viewFrom));
    // Position the mover div to align with the current scroll position
    cm.display.mover.style.top = display.viewOffset + "px";

    var toUpdate = countDirtyView(cm);
    if (!different && toUpdate == 0 && !update.force && display.renderedView == display.view &&
        (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo))
      return false;

    // For big changes, we hide the enclosing element during the
    // update, since that speeds up the operations on most browsers.
    var focused = activeElt();
    if (toUpdate > 4) display.lineDiv.style.display = "none";
    patchDisplay(cm, display.updateLineNumbers, update.dims);
    if (toUpdate > 4) display.lineDiv.style.display = "";
    display.renderedView = display.view;
    // There might have been a widget with a focused element that got
    // hidden or updated, if so re-focus it.
    if (focused && activeElt() != focused && focused.offsetHeight) focused.focus();

    // Prevent selection and cursors from interfering with the scroll
    // width and height.
    removeChildren(display.cursorDiv);
    removeChildren(display.selectionDiv);
    display.gutters.style.height = display.sizer.style.minHeight = 0;

    if (different) {
      display.lastWrapHeight = update.wrapperHeight;
      display.lastWrapWidth = update.wrapperWidth;
      startWorker(cm, 400);
    }

    display.updateLineNumbers = null;

    return true;
  }

  function postUpdateDisplay(cm, update) {
    var viewport = update.viewport;
    for (var first = true;; first = false) {
      if (!first || !cm.options.lineWrapping || update.oldDisplayWidth == displayWidth(cm)) {
        // Clip forced viewport to actual scrollable area.
        if (viewport && viewport.top != null)
          viewport = {top: Math.min(cm.doc.height + paddingVert(cm.display) - displayHeight(cm), viewport.top)};
        // Updated line heights might result in the drawn area not
        // actually covering the viewport. Keep looping until it does.
        update.visible = visibleLines(cm.display, cm.doc, viewport);
        if (update.visible.from >= cm.display.viewFrom && update.visible.to <= cm.display.viewTo)
          break;
      }
      if (!updateDisplayIfNeeded(cm, update)) break;
      updateHeightsInViewport(cm);
      var barMeasure = measureForScrollbars(cm);
      updateSelection(cm);
      setDocumentHeight(cm, barMeasure);
      updateScrollbars(cm, barMeasure);
    }

    update.signal(cm, "update", cm);
    if (cm.display.viewFrom != cm.display.reportedViewFrom || cm.display.viewTo != cm.display.reportedViewTo) {
      update.signal(cm, "viewportChange", cm, cm.display.viewFrom, cm.display.viewTo);
      cm.display.reportedViewFrom = cm.display.viewFrom; cm.display.reportedViewTo = cm.display.viewTo;
    }
  }

  function updateDisplaySimple(cm, viewport) {
    var update = new DisplayUpdate(cm, viewport);
    if (updateDisplayIfNeeded(cm, update)) {
      updateHeightsInViewport(cm);
      postUpdateDisplay(cm, update);
      var barMeasure = measureForScrollbars(cm);
      updateSelection(cm);
      setDocumentHeight(cm, barMeasure);
      updateScrollbars(cm, barMeasure);
      update.finish();
    }
  }

  function setDocumentHeight(cm, measure) {
    cm.display.sizer.style.minHeight = measure.docHeight + "px";
    var total = measure.docHeight + cm.display.barHeight;
    cm.display.heightForcer.style.top = total + "px";
    cm.display.gutters.style.height = Math.max(total + scrollGap(cm), measure.clientHeight) + "px";
  }

  // Read the actual heights of the rendered lines, and update their
  // stored heights to match.
  function updateHeightsInViewport(cm) {
    var display = cm.display;
    var prevBottom = display.lineDiv.offsetTop;
    for (var i = 0; i < display.view.length; i++) {
      var cur = display.view[i], height;
      if (cur.hidden) continue;
      if (ie && ie_version < 8) {
        var bot = cur.node.offsetTop + cur.node.offsetHeight;
        height = bot - prevBottom;
        prevBottom = bot;
      } else {
        var box = cur.node.getBoundingClientRect();
        height = box.bottom - box.top;
      }
      var diff = cur.line.height - height;
      if (height < 2) height = textHeight(display);
      if (diff > .001 || diff < -.001) {
        updateLineHeight(cur.line, height);
        updateWidgetHeight(cur.line);
        if (cur.rest) for (var j = 0; j < cur.rest.length; j++)
          updateWidgetHeight(cur.rest[j]);
      }
    }
  }

  // Read and store the height of line widgets associated with the
  // given line.
  function updateWidgetHeight(line) {
    if (line.widgets) for (var i = 0; i < line.widgets.length; ++i)
      line.widgets[i].height = line.widgets[i].node.offsetHeight;
  }

  // Do a bulk-read of the DOM positions and sizes needed to draw the
  // view, so that we don't interleave reading and writing to the DOM.
  function getDimensions(cm) {
    var d = cm.display, left = {}, width = {};
    var gutterLeft = d.gutters.clientLeft;
    for (var n = d.gutters.firstChild, i = 0; n; n = n.nextSibling, ++i) {
      left[cm.options.gutters[i]] = n.offsetLeft + n.clientLeft + gutterLeft;
      width[cm.options.gutters[i]] = n.clientWidth;
    }
    return {fixedPos: compensateForHScroll(d),
            gutterTotalWidth: d.gutters.offsetWidth,
            gutterLeft: left,
            gutterWidth: width,
            wrapperWidth: d.wrapper.clientWidth};
  }

  // Sync the actual display DOM structure with display.view, removing
  // nodes for lines that are no longer in view, and creating the ones
  // that are not there yet, and updating the ones that are out of
  // date.
  function patchDisplay(cm, updateNumbersFrom, dims) {
    var display = cm.display, lineNumbers = cm.options.lineNumbers;
    var container = display.lineDiv, cur = container.firstChild;

    function rm(node) {
      var next = node.nextSibling;
      // Works around a throw-scroll bug in OS X Webkit
      if (webkit && mac && cm.display.currentWheelTarget == node)
        node.style.display = "none";
      else
        node.parentNode.removeChild(node);
      return next;
    }

    var view = display.view, lineN = display.viewFrom;
    // Loop over the elements in the view, syncing cur (the DOM nodes
    // in display.lineDiv) with the view as we go.
    for (var i = 0; i < view.length; i++) {
      var lineView = view[i];
      if (lineView.hidden) {
      } else if (!lineView.node || lineView.node.parentNode != container) { // Not drawn yet
        var node = buildLineElement(cm, lineView, lineN, dims);
        container.insertBefore(node, cur);
      } else { // Already drawn
        while (cur != lineView.node) cur = rm(cur);
        var updateNumber = lineNumbers && updateNumbersFrom != null &&
          updateNumbersFrom <= lineN && lineView.lineNumber;
        if (lineView.changes) {
          if (indexOf(lineView.changes, "gutter") > -1) updateNumber = false;
          updateLineForChanges(cm, lineView, lineN, dims);
        }
        if (updateNumber) {
          removeChildren(lineView.lineNumber);
          lineView.lineNumber.appendChild(document.createTextNode(lineNumberFor(cm.options, lineN)));
        }
        cur = lineView.node.nextSibling;
      }
      lineN += lineView.size;
    }
    while (cur) cur = rm(cur);
  }

  // When an aspect of a line changes, a string is added to
  // lineView.changes. This updates the relevant part of the line's
  // DOM structure.
  function updateLineForChanges(cm, lineView, lineN, dims) {
    for (var j = 0; j < lineView.changes.length; j++) {
      var type = lineView.changes[j];
      if (type == "text") updateLineText(cm, lineView);
      else if (type == "gutter") updateLineGutter(cm, lineView, lineN, dims);
      else if (type == "class") updateLineClasses(lineView);
      else if (type == "widget") updateLineWidgets(cm, lineView, dims);
    }
    lineView.changes = null;
  }

  // Lines with gutter elements, widgets or a background class need to
  // be wrapped, and have the extra elements added to the wrapper div
  function ensureLineWrapped(lineView) {
    if (lineView.node == lineView.text) {
      lineView.node = elt("div", null, null, "position: relative");
      if (lineView.text.parentNode)
        lineView.text.parentNode.replaceChild(lineView.node, lineView.text);
      lineView.node.appendChild(lineView.text);
      if (ie && ie_version < 8) lineView.node.style.zIndex = 2;
    }
    return lineView.node;
  }

  function updateLineBackground(lineView) {
    var cls = lineView.bgClass ? lineView.bgClass + " " + (lineView.line.bgClass || "") : lineView.line.bgClass;
    if (cls) cls += " CodeMirror-linebackground";
    if (lineView.background) {
      if (cls) lineView.background.className = cls;
      else { lineView.background.parentNode.removeChild(lineView.background); lineView.background = null; }
    } else if (cls) {
      var wrap = ensureLineWrapped(lineView);
      lineView.background = wrap.insertBefore(elt("div", null, cls), wrap.firstChild);
    }
  }

  // Wrapper around buildLineContent which will reuse the structure
  // in display.externalMeasured when possible.
  function getLineContent(cm, lineView) {
    var ext = cm.display.externalMeasured;
    if (ext && ext.line == lineView.line) {
      cm.display.externalMeasured = null;
      lineView.measure = ext.measure;
      return ext.built;
    }
    return buildLineContent(cm, lineView);
  }

  // Redraw the line's text. Interacts with the background and text
  // classes because the mode may output tokens that influence these
  // classes.
  function updateLineText(cm, lineView) {
    var cls = lineView.text.className;
    var built = getLineContent(cm, lineView);
    if (lineView.text == lineView.node) lineView.node = built.pre;
    lineView.text.parentNode.replaceChild(built.pre, lineView.text);
    lineView.text = built.pre;
    if (built.bgClass != lineView.bgClass || built.textClass != lineView.textClass) {
      lineView.bgClass = built.bgClass;
      lineView.textClass = built.textClass;
      updateLineClasses(lineView);
    } else if (cls) {
      lineView.text.className = cls;
    }
  }

  function updateLineClasses(lineView) {
    updateLineBackground(lineView);
    if (lineView.line.wrapClass)
      ensureLineWrapped(lineView).className = lineView.line.wrapClass;
    else if (lineView.node != lineView.text)
      lineView.node.className = "";
    var textClass = lineView.textClass ? lineView.textClass + " " + (lineView.line.textClass || "") : lineView.line.textClass;
    lineView.text.className = textClass || "";
  }

  function updateLineGutter(cm, lineView, lineN, dims) {
    if (lineView.gutter) {
      lineView.node.removeChild(lineView.gutter);
      lineView.gutter = null;
    }
    if (lineView.gutterBackground) {
      lineView.node.removeChild(lineView.gutterBackground);
      lineView.gutterBackground = null;
    }
    if (lineView.line.gutterClass) {
      var wrap = ensureLineWrapped(lineView);
      lineView.gutterBackground = elt("div", null, "CodeMirror-gutter-background " + lineView.line.gutterClass,
                                      "left: " + (cm.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) +
                                      "px; width: " + dims.gutterTotalWidth + "px");
      wrap.insertBefore(lineView.gutterBackground, lineView.text);
    }
    var markers = lineView.line.gutterMarkers;
    if (cm.options.lineNumbers || markers) {
      var wrap = ensureLineWrapped(lineView);
      var gutterWrap = lineView.gutter = elt("div", null, "CodeMirror-gutter-wrapper", "left: " +
                                             (cm.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) + "px");
      cm.display.input.setUneditable(gutterWrap);
      wrap.insertBefore(gutterWrap, lineView.text);
      if (lineView.line.gutterClass)
        gutterWrap.className += " " + lineView.line.gutterClass;
      if (cm.options.lineNumbers && (!markers || !markers["CodeMirror-linenumbers"]))
        lineView.lineNumber = gutterWrap.appendChild(
          elt("div", lineNumberFor(cm.options, lineN),
              "CodeMirror-linenumber CodeMirror-gutter-elt",
              "left: " + dims.gutterLeft["CodeMirror-linenumbers"] + "px; width: "
              + cm.display.lineNumInnerWidth + "px"));
      if (markers) for (var k = 0; k < cm.options.gutters.length; ++k) {
        var id = cm.options.gutters[k], found = markers.hasOwnProperty(id) && markers[id];
        if (found)
          gutterWrap.appendChild(elt("div", [found], "CodeMirror-gutter-elt", "left: " +
                                     dims.gutterLeft[id] + "px; width: " + dims.gutterWidth[id] + "px"));
      }
    }
  }

  function updateLineWidgets(cm, lineView, dims) {
    if (lineView.alignable) lineView.alignable = null;
    for (var node = lineView.node.firstChild, next; node; node = next) {
      var next = node.nextSibling;
      if (node.className == "CodeMirror-linewidget")
        lineView.node.removeChild(node);
    }
    insertLineWidgets(cm, lineView, dims);
  }

  // Build a line's DOM representation from scratch
  function buildLineElement(cm, lineView, lineN, dims) {
    var built = getLineContent(cm, lineView);
    lineView.text = lineView.node = built.pre;
    if (built.bgClass) lineView.bgClass = built.bgClass;
    if (built.textClass) lineView.textClass = built.textClass;

    updateLineClasses(lineView);
    updateLineGutter(cm, lineView, lineN, dims);
    insertLineWidgets(cm, lineView, dims);
    return lineView.node;
  }

  // A lineView may contain multiple logical lines (when merged by
  // collapsed spans). The widgets for all of them need to be drawn.
  function insertLineWidgets(cm, lineView, dims) {
    insertLineWidgetsFor(cm, lineView.line, lineView, dims, true);
    if (lineView.rest) for (var i = 0; i < lineView.rest.length; i++)
      insertLineWidgetsFor(cm, lineView.rest[i], lineView, dims, false);
  }

  function insertLineWidgetsFor(cm, line, lineView, dims, allowAbove) {
    if (!line.widgets) return;
    var wrap = ensureLineWrapped(lineView);
    for (var i = 0, ws = line.widgets; i < ws.length; ++i) {
      var widget = ws[i], node = elt("div", [widget.node], "CodeMirror-linewidget");
      if (!widget.handleMouseEvents) node.setAttribute("cm-ignore-events", "true");
      positionLineWidget(widget, node, lineView, dims);
      cm.display.input.setUneditable(node);
      if (allowAbove && widget.above)
        wrap.insertBefore(node, lineView.gutter || lineView.text);
      else
        wrap.appendChild(node);
      signalLater(widget, "redraw");
    }
  }

  function positionLineWidget(widget, node, lineView, dims) {
    if (widget.noHScroll) {
      (lineView.alignable || (lineView.alignable = [])).push(node);
      var width = dims.wrapperWidth;
      node.style.left = dims.fixedPos + "px";
      if (!widget.coverGutter) {
        width -= dims.gutterTotalWidth;
        node.style.paddingLeft = dims.gutterTotalWidth + "px";
      }
      node.style.width = width + "px";
    }
    if (widget.coverGutter) {
      node.style.zIndex = 5;
      node.style.position = "relative";
      if (!widget.noHScroll) node.style.marginLeft = -dims.gutterTotalWidth + "px";
    }
  }

  // POSITION OBJECT

  // A Pos instance represents a position within the text.
  var Pos = CodeMirror.Pos = function(line, ch) {
    if (!(this instanceof Pos)) return new Pos(line, ch);
    this.line = line; this.ch = ch;
  };

  // Compare two positions, return 0 if they are the same, a negative
  // number when a is less, and a positive number otherwise.
  var cmp = CodeMirror.cmpPos = function(a, b) { return a.line - b.line || a.ch - b.ch; };

  function copyPos(x) {return Pos(x.line, x.ch);}
  function maxPos(a, b) { return cmp(a, b) < 0 ? b : a; }
  function minPos(a, b) { return cmp(a, b) < 0 ? a : b; }

  // INPUT HANDLING

  function ensureFocus(cm) {
    if (!cm.state.focused) { cm.display.input.focus(); onFocus(cm); }
  }

  function isReadOnly(cm) {
    return cm.options.readOnly || cm.doc.cantEdit;
  }

  // This will be set to an array of strings when copying, so that,
  // when pasting, we know what kind of selections the copied text
  // was made out of.
  var lastCopied = null;

  function applyTextInput(cm, inserted, deleted, sel, origin) {
    var doc = cm.doc;
    cm.display.shift = false;
    if (!sel) sel = doc.sel;

    var paste = cm.state.pasteIncoming || origin == "paste";
    var textLines = doc.splitLines(inserted), multiPaste = null;
    // When pasing N lines into N selections, insert one line per selection
    if (paste && sel.ranges.length > 1) {
      if (lastCopied && lastCopied.join("\n") == inserted) {
        if (sel.ranges.length % lastCopied.length == 0) {
          multiPaste = [];
          for (var i = 0; i < lastCopied.length; i++)
            multiPaste.push(doc.splitLines(lastCopied[i]));
        }
      } else if (textLines.length == sel.ranges.length) {
        multiPaste = map(textLines, function(l) { return [l]; });
      }
    }

    // Normal behavior is to insert the new text into every selection
    for (var i = sel.ranges.length - 1; i >= 0; i--) {
      var range = sel.ranges[i];
      var from = range.from(), to = range.to();
      if (range.empty()) {
        if (deleted && deleted > 0) // Handle deletion
          from = Pos(from.line, from.ch - deleted);
        else if (cm.state.overwrite && !paste) // Handle overwrite
          to = Pos(to.line, Math.min(getLine(doc, to.line).text.length, to.ch + lst(textLines).length));
      }
      var updateInput = cm.curOp.updateInput;
      var changeEvent = {from: from, to: to, text: multiPaste ? multiPaste[i % multiPaste.length] : textLines,
                         origin: origin || (paste ? "paste" : cm.state.cutIncoming ? "cut" : "+input")};
      makeChange(cm.doc, changeEvent);
      signalLater(cm, "inputRead", cm, changeEvent);
    }
    if (inserted && !paste)
      triggerElectric(cm, inserted);

    ensureCursorVisible(cm);
    cm.curOp.updateInput = updateInput;
    cm.curOp.typing = true;
    cm.state.pasteIncoming = cm.state.cutIncoming = false;
  }

  function handlePaste(e, cm) {
    var pasted = e.clipboardData && e.clipboardData.getData("text/plain");
    if (pasted) {
      e.preventDefault();
      if (!isReadOnly(cm) && !cm.options.disableInput)
        runInOp(cm, function() { applyTextInput(cm, pasted, 0, null, "paste"); });
      return true;
    }
  }

  function triggerElectric(cm, inserted) {
    // When an 'electric' character is inserted, immediately trigger a reindent
    if (!cm.options.electricChars || !cm.options.smartIndent) return;
    var sel = cm.doc.sel;

    for (var i = sel.ranges.length - 1; i >= 0; i--) {
      var range = sel.ranges[i];
      if (range.head.ch > 100 || (i && sel.ranges[i - 1].head.line == range.head.line)) continue;
      var mode = cm.getModeAt(range.head);
      var indented = false;
      if (mode.electricChars) {
        for (var j = 0; j < mode.electricChars.length; j++)
          if (inserted.indexOf(mode.electricChars.charAt(j)) > -1) {
            indented = indentLine(cm, range.head.line, "smart");
            break;
          }
      } else if (mode.electricInput) {
        if (mode.electricInput.test(getLine(cm.doc, range.head.line).text.slice(0, range.head.ch)))
          indented = indentLine(cm, range.head.line, "smart");
      }
      if (indented) signalLater(cm, "electricInput", cm, range.head.line);
    }
  }

  function copyableRanges(cm) {
    var text = [], ranges = [];
    for (var i = 0; i < cm.doc.sel.ranges.length; i++) {
      var line = cm.doc.sel.ranges[i].head.line;
      var lineRange = {anchor: Pos(line, 0), head: Pos(line + 1, 0)};
      ranges.push(lineRange);
      text.push(cm.getRange(lineRange.anchor, lineRange.head));
    }
    return {text: text, ranges: ranges};
  }

  function disableBrowserMagic(field) {
    field.setAttribute("autocorrect", "off");
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("spellcheck", "false");
  }

  // TEXTAREA INPUT STYLE

  function TextareaInput(cm) {
    this.cm = cm;
    // See input.poll and input.reset
    this.prevInput = "";

    // Flag that indicates whether we expect input to appear real soon
    // now (after some event like 'keypress' or 'input') and are
    // polling intensively.
    this.pollingFast = false;
    // Self-resetting timeout for the poller
    this.polling = new Delayed();
    // Tracks when input.reset has punted to just putting a short
    // string into the textarea instead of the full selection.
    this.inaccurateSelection = false;
    // Used to work around IE issue with selection being forgotten when focus moves away from textarea
    this.hasSelection = false;
    this.composing = null;
  };

  function hiddenTextarea() {
    var te = elt("textarea", null, null, "position: absolute; padding: 0; width: 1px; height: 1em; outline: none");
    var div = elt("div", [te], null, "overflow: hidden; position: relative; width: 3px; height: 0px;");
    // The textarea is kept positioned near the cursor to prevent the
    // fact that it'll be scrolled into view on input from scrolling
    // our fake cursor out of view. On webkit, when wrap=off, paste is
    // very slow. So make the area wide instead.
    if (webkit) te.style.width = "1000px";
    else te.setAttribute("wrap", "off");
    // If border: 0; -- iOS fails to open keyboard (issue #1287)
    if (ios) te.style.border = "1px solid black";
    disableBrowserMagic(te);
    return div;
  }

  TextareaInput.prototype = copyObj({
    init: function(display) {
      var input = this, cm = this.cm;

      // Wraps and hides input textarea
      var div = this.wrapper = hiddenTextarea();
      // The semihidden textarea that is focused when the editor is
      // focused, and receives input.
      var te = this.textarea = div.firstChild;
      display.wrapper.insertBefore(div, display.wrapper.firstChild);

      // Needed to hide big blue blinking cursor on Mobile Safari (doesn't seem to work in iOS 8 anymore)
      if (ios) te.style.width = "0px";

      on(te, "input", function() {
        if (ie && ie_version >= 9 && input.hasSelection) input.hasSelection = null;
        input.poll();
      });

      on(te, "paste", function(e) {
        if (handlePaste(e, cm)) return true;

        cm.state.pasteIncoming = true;
        input.fastPoll();
      });

      function prepareCopyCut(e) {
        if (cm.somethingSelected()) {
          lastCopied = cm.getSelections();
          if (input.inaccurateSelection) {
            input.prevInput = "";
            input.inaccurateSelection = false;
            te.value = lastCopied.join("\n");
            selectInput(te);
          }
        } else if (!cm.options.lineWiseCopyCut) {
          return;
        } else {
          var ranges = copyableRanges(cm);
          lastCopied = ranges.text;
          if (e.type == "cut") {
            cm.setSelections(ranges.ranges, null, sel_dontScroll);
          } else {
            input.prevInput = "";
            te.value = ranges.text.join("\n");
            selectInput(te);
          }
        }
        if (e.type == "cut") cm.state.cutIncoming = true;
      }
      on(te, "cut", prepareCopyCut);
      on(te, "copy", prepareCopyCut);

      on(display.scroller, "paste", function(e) {
        if (eventInWidget(display, e)) return;
        cm.state.pasteIncoming = true;
        input.focus();
      });

      // Prevent normal selection in the editor (we handle our own)
      on(display.lineSpace, "selectstart", function(e) {
        if (!eventInWidget(display, e)) e_preventDefault(e);
      });

      on(te, "compositionstart", function() {
        var start = cm.getCursor("from");
        if (input.composing) input.composing.range.clear()
        input.composing = {
          start: start,
          range: cm.markText(start, cm.getCursor("to"), {className: "CodeMirror-composing"})
        };
      });
      on(te, "compositionend", function() {
        if (input.composing) {
          input.poll();
          input.composing.range.clear();
          input.composing = null;
        }
      });
    },

    prepareSelection: function() {
      // Redraw the selection and/or cursor
      var cm = this.cm, display = cm.display, doc = cm.doc;
      var result = prepareSelection(cm);

      // Move the hidden textarea near the cursor to prevent scrolling artifacts
      if (cm.options.moveInputWithCursor) {
        var headPos = cursorCoords(cm, doc.sel.primary().head, "div");
        var wrapOff = display.wrapper.getBoundingClientRect(), lineOff = display.lineDiv.getBoundingClientRect();
        result.teTop = Math.max(0, Math.min(display.wrapper.clientHeight - 10,
                                            headPos.top + lineOff.top - wrapOff.top));
        result.teLeft = Math.max(0, Math.min(display.wrapper.clientWidth - 10,
                                             headPos.left + lineOff.left - wrapOff.left));
      }

      return result;
    },

    showSelection: function(drawn) {
      var cm = this.cm, display = cm.display;
      removeChildrenAndAdd(display.cursorDiv, drawn.cursors);
      removeChildrenAndAdd(display.selectionDiv, drawn.selection);
      if (drawn.teTop != null) {
        this.wrapper.style.top = drawn.teTop + "px";
        this.wrapper.style.left = drawn.teLeft + "px";
      }
    },

    // Reset the input to correspond to the selection (or to be empty,
    // when not typing and nothing is selected)
    reset: function(typing) {
      if (this.contextMenuPending) return;
      var minimal, selected, cm = this.cm, doc = cm.doc;
      if (cm.somethingSelected()) {
        this.prevInput = "";
        var range = doc.sel.primary();
        minimal = hasCopyEvent &&
          (range.to().line - range.from().line > 100 || (selected = cm.getSelection()).length > 1000);
        var content = minimal ? "-" : selected || cm.getSelection();
        this.textarea.value = content;
        if (cm.state.focused) selectInput(this.textarea);
        if (ie && ie_version >= 9) this.hasSelection = content;
      } else if (!typing) {
        this.prevInput = this.textarea.value = "";
        if (ie && ie_version >= 9) this.hasSelection = null;
      }
      this.inaccurateSelection = minimal;
    },

    getField: function() { return this.textarea; },

    supportsTouch: function() { return false; },

    focus: function() {
      if (this.cm.options.readOnly != "nocursor" && (!mobile || activeElt() != this.textarea)) {
        try { this.textarea.focus(); }
        catch (e) {} // IE8 will throw if the textarea is display: none or not in DOM
      }
    },

    blur: function() { this.textarea.blur(); },

    resetPosition: function() {
      this.wrapper.style.top = this.wrapper.style.left = 0;
    },

    receivedFocus: function() { this.slowPoll(); },

    // Poll for input changes, using the normal rate of polling. This
    // runs as long as the editor is focused.
    slowPoll: function() {
      var input = this;
      if (input.pollingFast) return;
      input.polling.set(this.cm.options.pollInterval, function() {
        input.poll();
        if (input.cm.state.focused) input.slowPoll();
      });
    },

    // When an event has just come in that is likely to add or change
    // something in the input textarea, we poll faster, to ensure that
    // the change appears on the screen quickly.
    fastPoll: function() {
      var missed = false, input = this;
      input.pollingFast = true;
      function p() {
        var changed = input.poll();
        if (!changed && !missed) {missed = true; input.polling.set(60, p);}
        else {input.pollingFast = false; input.slowPoll();}
      }
      input.polling.set(20, p);
    },

    // Read input from the textarea, and update the document to match.
    // When something is selected, it is present in the textarea, and
    // selected (unless it is huge, in which case a placeholder is
    // used). When nothing is selected, the cursor sits after previously
    // seen text (can be empty), which is stored in prevInput (we must
    // not reset the textarea when typing, because that breaks IME).
    poll: function() {
      var cm = this.cm, input = this.textarea, prevInput = this.prevInput;
      // Since this is called a *lot*, try to bail out as cheaply as
      // possible when it is clear that nothing happened. hasSelection
      // will be the case when there is a lot of text in the textarea,
      // in which case reading its value would be expensive.
      if (this.contextMenuPending || !cm.state.focused ||
          (hasSelection(input) && !prevInput && !this.composing) ||
          isReadOnly(cm) || cm.options.disableInput || cm.state.keySeq)
        return false;

      var text = input.value;
      // If nothing changed, bail.
      if (text == prevInput && !cm.somethingSelected()) return false;
      // Work around nonsensical selection resetting in IE9/10, and
      // inexplicable appearance of private area unicode characters on
      // some key combos in Mac (#2689).
      if (ie && ie_version >= 9 && this.hasSelection === text ||
          mac && /[\uf700-\uf7ff]/.test(text)) {
        cm.display.input.reset();
        return false;
      }

      if (cm.doc.sel == cm.display.selForContextMenu) {
        var first = text.charCodeAt(0);
        if (first == 0x200b && !prevInput) prevInput = "\u200b";
        if (first == 0x21da) { this.reset(); return this.cm.execCommand("undo"); }
      }
      // Find the part of the input that is actually new
      var same = 0, l = Math.min(prevInput.length, text.length);
      while (same < l && prevInput.charCodeAt(same) == text.charCodeAt(same)) ++same;

      var self = this;
      runInOp(cm, function() {
        applyTextInput(cm, text.slice(same), prevInput.length - same,
                       null, self.composing ? "*compose" : null);

        // Don't leave long text in the textarea, since it makes further polling slow
        if (text.length > 1000 || text.indexOf("\n") > -1) input.value = self.prevInput = "";
        else self.prevInput = text;

        if (self.composing) {
          self.composing.range.clear();
          self.composing.range = cm.markText(self.composing.start, cm.getCursor("to"),
                                             {className: "CodeMirror-composing"});
        }
      });
      return true;
    },

    ensurePolled: function() {
      if (this.pollingFast && this.poll()) this.pollingFast = false;
    },

    onKeyPress: function() {
      if (ie && ie_version >= 9) this.hasSelection = null;
      this.fastPoll();
    },

    onContextMenu: function(e) {
      var input = this, cm = input.cm, display = cm.display, te = input.textarea;
      var pos = posFromMouse(cm, e), scrollPos = display.scroller.scrollTop;
      if (!pos || presto) return; // Opera is difficult.

      // Reset the current text selection only if the click is done outside of the selection
      // and 'resetSelectionOnContextMenu' option is true.
      var reset = cm.options.resetSelectionOnContextMenu;
      if (reset && cm.doc.sel.contains(pos) == -1)
        operation(cm, setSelection)(cm.doc, simpleSelection(pos), sel_dontScroll);

      var oldCSS = te.style.cssText;
      input.wrapper.style.position = "absolute";
      te.style.cssText = "position: fixed; width: 30px; height: 30px; top: " + (e.clientY - 5) +
        "px; left: " + (e.clientX - 5) + "px; z-index: 1000; background: " +
        (ie ? "rgba(255, 255, 255, .05)" : "transparent") +
        "; outline: none; border-width: 0; outline: none; overflow: hidden; opacity: .05; filter: alpha(opacity=5);";
      if (webkit) var oldScrollY = window.scrollY; // Work around Chrome issue (#2712)
      display.input.focus();
      if (webkit) window.scrollTo(null, oldScrollY);
      display.input.reset();
      // Adds "Select all" to context menu in FF
      if (!cm.somethingSelected()) te.value = input.prevInput = " ";
      input.contextMenuPending = true;
      display.selForContextMenu = cm.doc.sel;
      clearTimeout(display.detectingSelectAll);

      // Select-all will be greyed out if there's nothing to select, so
      // this adds a zero-width space so that we can later check whether
      // it got selected.
      function prepareSelectAllHack() {
        if (te.selectionStart != null) {
          var selected = cm.somethingSelected();
          var extval = "\u200b" + (selected ? te.value : "");
          te.value = "\u21da"; // Used to catch context-menu undo
          te.value = extval;
          input.prevInput = selected ? "" : "\u200b";
          te.selectionStart = 1; te.selectionEnd = extval.length;
          // Re-set this, in case some other handler touched the
          // selection in the meantime.
          display.selForContextMenu = cm.doc.sel;
        }
      }
      function rehide() {
        input.contextMenuPending = false;
        input.wrapper.style.position = "relative";
        te.style.cssText = oldCSS;
        if (ie && ie_version < 9) display.scrollbars.setScrollTop(display.scroller.scrollTop = scrollPos);

        // Try to detect the user choosing select-all
        if (te.selectionStart != null) {
          if (!ie || (ie && ie_version < 9)) prepareSelectAllHack();
          var i = 0, poll = function() {
            if (display.selForContextMenu == cm.doc.sel && te.selectionStart == 0 &&
                te.selectionEnd > 0 && input.prevInput == "\u200b")
              operation(cm, commands.selectAll)(cm);
            else if (i++ < 10) display.detectingSelectAll = setTimeout(poll, 500);
            else display.input.reset();
          };
          display.detectingSelectAll = setTimeout(poll, 200);
        }
      }

      if (ie && ie_version >= 9) prepareSelectAllHack();
      if (captureRightClick) {
        e_stop(e);
        var mouseup = function() {
          off(window, "mouseup", mouseup);
          setTimeout(rehide, 20);
        };
        on(window, "mouseup", mouseup);
      } else {
        setTimeout(rehide, 50);
      }
    },

    readOnlyChanged: function(val) {
      if (!val) this.reset();
    },

    setUneditable: nothing,

    needsContentAttribute: false
  }, TextareaInput.prototype);

  // CONTENTEDITABLE INPUT STYLE

  function ContentEditableInput(cm) {
    this.cm = cm;
    this.lastAnchorNode = this.lastAnchorOffset = this.lastFocusNode = this.lastFocusOffset = null;
    this.polling = new Delayed();
    this.gracePeriod = false;
  }

  ContentEditableInput.prototype = copyObj({
    init: function(display) {
      var input = this, cm = input.cm;
      var div = input.div = display.lineDiv;
      disableBrowserMagic(div);

      on(div, "paste", function(e) { handlePaste(e, cm); })

      on(div, "compositionstart", function(e) {
        var data = e.data;
        input.composing = {sel: cm.doc.sel, data: data, startData: data};
        if (!data) return;
        var prim = cm.doc.sel.primary();
        var line = cm.getLine(prim.head.line);
        var found = line.indexOf(data, Math.max(0, prim.head.ch - data.length));
        if (found > -1 && found <= prim.head.ch)
          input.composing.sel = simpleSelection(Pos(prim.head.line, found),
                                                Pos(prim.head.line, found + data.length));
      });
      on(div, "compositionupdate", function(e) {
        input.composing.data = e.data;
      });
      on(div, "compositionend", function(e) {
        var ours = input.composing;
        if (!ours) return;
        if (e.data != ours.startData && !/\u200b/.test(e.data))
          ours.data = e.data;
        // Need a small delay to prevent other code (input event,
        // selection polling) from doing damage when fired right after
        // compositionend.
        setTimeout(function() {
          if (!ours.handled)
            input.applyComposition(ours);
          if (input.composing == ours)
            input.composing = null;
        }, 50);
      });

      on(div, "touchstart", function() {
        input.forceCompositionEnd();
      });

      on(div, "input", function() {
        if (input.composing) return;
        if (isReadOnly(cm) || !input.pollContent())
          runInOp(input.cm, function() {regChange(cm);});
      });

      function onCopyCut(e) {
        if (cm.somethingSelected()) {
          lastCopied = cm.getSelections();
          if (e.type == "cut") cm.replaceSelection("", null, "cut");
        } else if (!cm.options.lineWiseCopyCut) {
          return;
        } else {
          var ranges = copyableRanges(cm);
          lastCopied = ranges.text;
          if (e.type == "cut") {
            cm.operation(function() {
              cm.setSelections(ranges.ranges, 0, sel_dontScroll);
              cm.replaceSelection("", null, "cut");
            });
          }
        }
        // iOS exposes the clipboard API, but seems to discard content inserted into it
        if (e.clipboardData && !ios) {
          e.preventDefault();
          e.clipboardData.clearData();
          e.clipboardData.setData("text/plain", lastCopied.join("\n"));
        } else {
          // Old-fashioned briefly-focus-a-textarea hack
          var kludge = hiddenTextarea(), te = kludge.firstChild;
          cm.display.lineSpace.insertBefore(kludge, cm.display.lineSpace.firstChild);
          te.value = lastCopied.join("\n");
          var hadFocus = document.activeElement;
          selectInput(te);
          setTimeout(function() {
            cm.display.lineSpace.removeChild(kludge);
            hadFocus.focus();
          }, 50);
        }
      }
      on(div, "copy", onCopyCut);
      on(div, "cut", onCopyCut);
    },

    prepareSelection: function() {
      var result = prepareSelection(this.cm, false);
      result.focus = this.cm.state.focused;
      return result;
    },

    showSelection: function(info) {
      if (!info || !this.cm.display.view.length) return;
      if (info.focus) this.showPrimarySelection();
      this.showMultipleSelections(info);
    },

    showPrimarySelection: function() {
      var sel = window.getSelection(), prim = this.cm.doc.sel.primary();
      var curAnchor = domToPos(this.cm, sel.anchorNode, sel.anchorOffset);
      var curFocus = domToPos(this.cm, sel.focusNode, sel.focusOffset);
      if (curAnchor && !curAnchor.bad && curFocus && !curFocus.bad &&
          cmp(minPos(curAnchor, curFocus), prim.from()) == 0 &&
          cmp(maxPos(curAnchor, curFocus), prim.to()) == 0)
        return;

      var start = posToDOM(this.cm, prim.from());
      var end = posToDOM(this.cm, prim.to());
      if (!start && !end) return;

      var view = this.cm.display.view;
      var old = sel.rangeCount && sel.getRangeAt(0);
      if (!start) {
        start = {node: view[0].measure.map[2], offset: 0};
      } else if (!end) { // FIXME dangerously hacky
        var measure = view[view.length - 1].measure;
        var map = measure.maps ? measure.maps[measure.maps.length - 1] : measure.map;
        end = {node: map[map.length - 1], offset: map[map.length - 2] - map[map.length - 3]};
      }

      try { var rng = range(start.node, start.offset, end.offset, end.node); }
      catch(e) {} // Our model of the DOM might be outdated, in which case the range we try to set can be impossible
      if (rng) {
        sel.removeAllRanges();
        sel.addRange(rng);
        if (old && sel.anchorNode == null) sel.addRange(old);
        else if (gecko) this.startGracePeriod();
      }
      this.rememberSelection();
    },

    startGracePeriod: function() {
      var input = this;
      clearTimeout(this.gracePeriod);
      this.gracePeriod = setTimeout(function() {
        input.gracePeriod = false;
        if (input.selectionChanged())
          input.cm.operation(function() { input.cm.curOp.selectionChanged = true; });
      }, 20);
    },

    showMultipleSelections: function(info) {
      removeChildrenAndAdd(this.cm.display.cursorDiv, info.cursors);
      removeChildrenAndAdd(this.cm.display.selectionDiv, info.selection);
    },

    rememberSelection: function() {
      var sel = window.getSelection();
      this.lastAnchorNode = sel.anchorNode; this.lastAnchorOffset = sel.anchorOffset;
      this.lastFocusNode = sel.focusNode; this.lastFocusOffset = sel.focusOffset;
    },

    selectionInEditor: function() {
      var sel = window.getSelection();
      if (!sel.rangeCount) return false;
      var node = sel.getRangeAt(0).commonAncestorContainer;
      return contains(this.div, node);
    },

    focus: function() {
      if (this.cm.options.readOnly != "nocursor") this.div.focus();
    },
    blur: function() { this.div.blur(); },
    getField: function() { return this.div; },

    supportsTouch: function() { return true; },

    receivedFocus: function() {
      var input = this;
      if (this.selectionInEditor())
        this.pollSelection();
      else
        runInOp(this.cm, function() { input.cm.curOp.selectionChanged = true; });

      function poll() {
        if (input.cm.state.focused) {
          input.pollSelection();
          input.polling.set(input.cm.options.pollInterval, poll);
        }
      }
      this.polling.set(this.cm.options.pollInterval, poll);
    },

    selectionChanged: function() {
      var sel = window.getSelection();
      return sel.anchorNode != this.lastAnchorNode || sel.anchorOffset != this.lastAnchorOffset ||
        sel.focusNode != this.lastFocusNode || sel.focusOffset != this.lastFocusOffset;
    },

    pollSelection: function() {
      if (!this.composing && !this.gracePeriod && this.selectionChanged()) {
        var sel = window.getSelection(), cm = this.cm;
        this.rememberSelection();
        var anchor = domToPos(cm, sel.anchorNode, sel.anchorOffset);
        var head = domToPos(cm, sel.focusNode, sel.focusOffset);
        if (anchor && head) runInOp(cm, function() {
          setSelection(cm.doc, simpleSelection(anchor, head), sel_dontScroll);
          if (anchor.bad || head.bad) cm.curOp.selectionChanged = true;
        });
      }
    },

    pollContent: function() {
      var cm = this.cm, display = cm.display, sel = cm.doc.sel.primary();
      var from = sel.from(), to = sel.to();
      if (from.line < display.viewFrom || to.line > display.viewTo - 1) return false;

      var fromIndex;
      if (from.line == display.viewFrom || (fromIndex = findViewIndex(cm, from.line)) == 0) {
        var fromLine = lineNo(display.view[0].line);
        var fromNode = display.view[0].node;
      } else {
        var fromLine = lineNo(display.view[fromIndex].line);
        var fromNode = display.view[fromIndex - 1].node.nextSibling;
      }
      var toIndex = findViewIndex(cm, to.line);
      if (toIndex == display.view.length - 1) {
        var toLine = display.viewTo - 1;
        var toNode = display.lineDiv.lastChild;
      } else {
        var toLine = lineNo(display.view[toIndex + 1].line) - 1;
        var toNode = display.view[toIndex + 1].node.previousSibling;
      }

      var newText = cm.doc.splitLines(domTextBetween(cm, fromNode, toNode, fromLine, toLine));
      var oldText = getBetween(cm.doc, Pos(fromLine, 0), Pos(toLine, getLine(cm.doc, toLine).text.length));
      while (newText.length > 1 && oldText.length > 1) {
        if (lst(newText) == lst(oldText)) { newText.pop(); oldText.pop(); toLine--; }
        else if (newText[0] == oldText[0]) { newText.shift(); oldText.shift(); fromLine++; }
        else break;
      }

      var cutFront = 0, cutEnd = 0;
      var newTop = newText[0], oldTop = oldText[0], maxCutFront = Math.min(newTop.length, oldTop.length);
      while (cutFront < maxCutFront && newTop.charCodeAt(cutFront) == oldTop.charCodeAt(cutFront))
        ++cutFront;
      var newBot = lst(newText), oldBot = lst(oldText);
      var maxCutEnd = Math.min(newBot.length - (newText.length == 1 ? cutFront : 0),
                               oldBot.length - (oldText.length == 1 ? cutFront : 0));
      while (cutEnd < maxCutEnd &&
             newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1))
        ++cutEnd;

      newText[newText.length - 1] = newBot.slice(0, newBot.length - cutEnd);
      newText[0] = newText[0].slice(cutFront);

      var chFrom = Pos(fromLine, cutFront);
      var chTo = Pos(toLine, oldText.length ? lst(oldText).length - cutEnd : 0);
      if (newText.length > 1 || newText[0] || cmp(chFrom, chTo)) {
        replaceRange(cm.doc, newText, chFrom, chTo, "+input");
        return true;
      }
    },

    ensurePolled: function() {
      this.forceCompositionEnd();
    },
    reset: function() {
      this.forceCompositionEnd();
    },
    forceCompositionEnd: function() {
      if (!this.composing || this.composing.handled) return;
      this.applyComposition(this.composing);
      this.composing.handled = true;
      this.div.blur();
      this.div.focus();
    },
    applyComposition: function(composing) {
      if (isReadOnly(this.cm))
        operation(this.cm, regChange)(this.cm)
      else if (composing.data && composing.data != composing.startData)
        operation(this.cm, applyTextInput)(this.cm, composing.data, 0, composing.sel);
    },

    setUneditable: function(node) {
      node.contentEditable = "false"
    },

    onKeyPress: function(e) {
      e.preventDefault();
      if (!isReadOnly(this.cm))
        operation(this.cm, applyTextInput)(this.cm, String.fromCharCode(e.charCode == null ? e.keyCode : e.charCode), 0);
    },

    readOnlyChanged: function(val) {
      this.div.contentEditable = String(val != "nocursor")
    },

    onContextMenu: nothing,
    resetPosition: nothing,

    needsContentAttribute: true
  }, ContentEditableInput.prototype);

  function posToDOM(cm, pos) {
    var view = findViewForLine(cm, pos.line);
    if (!view || view.hidden) return null;
    var line = getLine(cm.doc, pos.line);
    var info = mapFromLineView(view, line, pos.line);

    var order = getOrder(line), side = "left";
    if (order) {
      var partPos = getBidiPartAt(order, pos.ch);
      side = partPos % 2 ? "right" : "left";
    }
    var result = nodeAndOffsetInLineMap(info.map, pos.ch, side);
    result.offset = result.collapse == "right" ? result.end : result.start;
    return result;
  }

  function badPos(pos, bad) { if (bad) pos.bad = true; return pos; }

  function domToPos(cm, node, offset) {
    var lineNode;
    if (node == cm.display.lineDiv) {
      lineNode = cm.display.lineDiv.childNodes[offset];
      if (!lineNode) return badPos(cm.clipPos(Pos(cm.display.viewTo - 1)), true);
      node = null; offset = 0;
    } else {
      for (lineNode = node;; lineNode = lineNode.parentNode) {
        if (!lineNode || lineNode == cm.display.lineDiv) return null;
        if (lineNode.parentNode && lineNode.parentNode == cm.display.lineDiv) break;
      }
    }
    for (var i = 0; i < cm.display.view.length; i++) {
      var lineView = cm.display.view[i];
      if (lineView.node == lineNode)
        return locateNodeInLineView(lineView, node, offset);
    }
  }

  function locateNodeInLineView(lineView, node, offset) {
    var wrapper = lineView.text.firstChild, bad = false;
    if (!node || !contains(wrapper, node)) return badPos(Pos(lineNo(lineView.line), 0), true);
    if (node == wrapper) {
      bad = true;
      node = wrapper.childNodes[offset];
      offset = 0;
      if (!node) {
        var line = lineView.rest ? lst(lineView.rest) : lineView.line;
        return badPos(Pos(lineNo(line), line.text.length), bad);
      }
    }

    var textNode = node.nodeType == 3 ? node : null, topNode = node;
    if (!textNode && node.childNodes.length == 1 && node.firstChild.nodeType == 3) {
      textNode = node.firstChild;
      if (offset) offset = textNode.nodeValue.length;
    }
    while (topNode.parentNode != wrapper) topNode = topNode.parentNode;
    var measure = lineView.measure, maps = measure.maps;

    function find(textNode, topNode, offset) {
      for (var i = -1; i < (maps ? maps.length : 0); i++) {
        var map = i < 0 ? measure.map : maps[i];
        for (var j = 0; j < map.length; j += 3) {
          var curNode = map[j + 2];
          if (curNode == textNode || curNode == topNode) {
            var line = lineNo(i < 0 ? lineView.line : lineView.rest[i]);
            var ch = map[j] + offset;
            if (offset < 0 || curNode != textNode) ch = map[j + (offset ? 1 : 0)];
            return Pos(line, ch);
          }
        }
      }
    }
    var found = find(textNode, topNode, offset);
    if (found) return badPos(found, bad);

    // FIXME this is all really shaky. might handle the few cases it needs to handle, but likely to cause problems
    for (var after = topNode.nextSibling, dist = textNode ? textNode.nodeValue.length - offset : 0; after; after = after.nextSibling) {
      found = find(after, after.firstChild, 0);
      if (found)
        return badPos(Pos(found.line, found.ch - dist), bad);
      else
        dist += after.textContent.length;
    }
    for (var before = topNode.previousSibling, dist = offset; before; before = before.previousSibling) {
      found = find(before, before.firstChild, -1);
      if (found)
        return badPos(Pos(found.line, found.ch + dist), bad);
      else
        dist += after.textContent.length;
    }
  }

  function domTextBetween(cm, from, to, fromLine, toLine) {
    var text = "", closing = false, lineSep = cm.doc.lineSeparator();
    function recognizeMarker(id) { return function(marker) { return marker.id == id; }; }
    function walk(node) {
      if (node.nodeType == 1) {
        var cmText = node.getAttribute("cm-text");
        if (cmText != null) {
          if (cmText == "") cmText = node.textContent.replace(/\u200b/g, "");
          text += cmText;
          return;
        }
        var markerID = node.getAttribute("cm-marker"), range;
        if (markerID) {
          var found = cm.findMarks(Pos(fromLine, 0), Pos(toLine + 1, 0), recognizeMarker(+markerID));
          if (found.length && (range = found[0].find()))
            text += getBetween(cm.doc, range.from, range.to).join(lineSep);
          return;
        }
        if (node.getAttribute("contenteditable") == "false") return;
        for (var i = 0; i < node.childNodes.length; i++)
          walk(node.childNodes[i]);
        if (/^(pre|div|p)$/i.test(node.nodeName))
          closing = true;
      } else if (node.nodeType == 3) {
        var val = node.nodeValue;
        if (!val) return;
        if (closing) {
          text += lineSep;
          closing = false;
        }
        text += val;
      }
    }
    for (;;) {
      walk(from);
      if (from == to) break;
      from = from.nextSibling;
    }
    return text;
  }

  CodeMirror.inputStyles = {"textarea": TextareaInput, "contenteditable": ContentEditableInput};

  // SELECTION / CURSOR

  // Selection objects are immutable. A new one is created every time
  // the selection changes. A selection is one or more non-overlapping
  // (and non-touching) ranges, sorted, and an integer that indicates
  // which one is the primary selection (the one that's scrolled into
  // view, that getCursor returns, etc).
  function Selection(ranges, primIndex) {
    this.ranges = ranges;
    this.primIndex = primIndex;
  }

  Selection.prototype = {
    primary: function() { return this.ranges[this.primIndex]; },
    equals: function(other) {
      if (other == this) return true;
      if (other.primIndex != this.primIndex || other.ranges.length != this.ranges.length) return false;
      for (var i = 0; i < this.ranges.length; i++) {
        var here = this.ranges[i], there = other.ranges[i];
        if (cmp(here.anchor, there.anchor) != 0 || cmp(here.head, there.head) != 0) return false;
      }
      return true;
    },
    deepCopy: function() {
      for (var out = [], i = 0; i < this.ranges.length; i++)
        out[i] = new Range(copyPos(this.ranges[i].anchor), copyPos(this.ranges[i].head));
      return new Selection(out, this.primIndex);
    },
    somethingSelected: function() {
      for (var i = 0; i < this.ranges.length; i++)
        if (!this.ranges[i].empty()) return true;
      return false;
    },
    contains: function(pos, end) {
      if (!end) end = pos;
      for (var i = 0; i < this.ranges.length; i++) {
        var range = this.ranges[i];
        if (cmp(end, range.from()) >= 0 && cmp(pos, range.to()) <= 0)
          return i;
      }
      return -1;
    }
  };

  function Range(anchor, head) {
    this.anchor = anchor; this.head = head;
  }

  Range.prototype = {
    from: function() { return minPos(this.anchor, this.head); },
    to: function() { return maxPos(this.anchor, this.head); },
    empty: function() {
      return this.head.line == this.anchor.line && this.head.ch == this.anchor.ch;
    }
  };

  // Take an unsorted, potentially overlapping set of ranges, and
  // build a selection out of it. 'Consumes' ranges array (modifying
  // it).
  function normalizeSelection(ranges, primIndex) {
    var prim = ranges[primIndex];
    ranges.sort(function(a, b) { return cmp(a.from(), b.from()); });
    primIndex = indexOf(ranges, prim);
    for (var i = 1; i < ranges.length; i++) {
      var cur = ranges[i], prev = ranges[i - 1];
      if (cmp(prev.to(), cur.from()) >= 0) {
        var from = minPos(prev.from(), cur.from()), to = maxPos(prev.to(), cur.to());
        var inv = prev.empty() ? cur.from() == cur.head : prev.from() == prev.head;
        if (i <= primIndex) --primIndex;
        ranges.splice(--i, 2, new Range(inv ? to : from, inv ? from : to));
      }
    }
    return new Selection(ranges, primIndex);
  }

  function simpleSelection(anchor, head) {
    return new Selection([new Range(anchor, head || anchor)], 0);
  }

  // Most of the external API clips given positions to make sure they
  // actually exist within the document.
  function clipLine(doc, n) {return Math.max(doc.first, Math.min(n, doc.first + doc.size - 1));}
  function clipPos(doc, pos) {
    if (pos.line < doc.first) return Pos(doc.first, 0);
    var last = doc.first + doc.size - 1;
    if (pos.line > last) return Pos(last, getLine(doc, last).text.length);
    return clipToLen(pos, getLine(doc, pos.line).text.length);
  }
  function clipToLen(pos, linelen) {
    var ch = pos.ch;
    if (ch == null || ch > linelen) return Pos(pos.line, linelen);
    else if (ch < 0) return Pos(pos.line, 0);
    else return pos;
  }
  function isLine(doc, l) {return l >= doc.first && l < doc.first + doc.size;}
  function clipPosArray(doc, array) {
    for (var out = [], i = 0; i < array.length; i++) out[i] = clipPos(doc, array[i]);
    return out;
  }

  // SELECTION UPDATES

  // The 'scroll' parameter given to many of these indicated whether
  // the new cursor position should be scrolled into view after
  // modifying the selection.

  // If shift is held or the extend flag is set, extends a range to
  // include a given position (and optionally a second position).
  // Otherwise, simply returns the range between the given positions.
  // Used for cursor motion and such.
  function extendRange(doc, range, head, other) {
    if (doc.cm && doc.cm.display.shift || doc.extend) {
      var anchor = range.anchor;
      if (other) {
        var posBefore = cmp(head, anchor) < 0;
        if (posBefore != (cmp(other, anchor) < 0)) {
          anchor = head;
          head = other;
        } else if (posBefore != (cmp(head, other) < 0)) {
          head = other;
        }
      }
      return new Range(anchor, head);
    } else {
      return new Range(other || head, head);
    }
  }

  // Extend the primary selection range, discard the rest.
  function extendSelection(doc, head, other, options) {
    setSelection(doc, new Selection([extendRange(doc, doc.sel.primary(), head, other)], 0), options);
  }

  // Extend all selections (pos is an array of selections with length
  // equal the number of selections)
  function extendSelections(doc, heads, options) {
    for (var out = [], i = 0; i < doc.sel.ranges.length; i++)
      out[i] = extendRange(doc, doc.sel.ranges[i], heads[i], null);
    var newSel = normalizeSelection(out, doc.sel.primIndex);
    setSelection(doc, newSel, options);
  }

  // Updates a single range in the selection.
  function replaceOneSelection(doc, i, range, options) {
    var ranges = doc.sel.ranges.slice(0);
    ranges[i] = range;
    setSelection(doc, normalizeSelection(ranges, doc.sel.primIndex), options);
  }

  // Reset the selection to a single range.
  function setSimpleSelection(doc, anchor, head, options) {
    setSelection(doc, simpleSelection(anchor, head), options);
  }

  // Give beforeSelectionChange handlers a change to influence a
  // selection update.
  function filterSelectionChange(doc, sel) {
    var obj = {
      ranges: sel.ranges,
      update: function(ranges) {
        this.ranges = [];
        for (var i = 0; i < ranges.length; i++)
          this.ranges[i] = new Range(clipPos(doc, ranges[i].anchor),
                                     clipPos(doc, ranges[i].head));
      }
    };
    signal(doc, "beforeSelectionChange", doc, obj);
    if (doc.cm) signal(doc.cm, "beforeSelectionChange", doc.cm, obj);
    if (obj.ranges != sel.ranges) return normalizeSelection(obj.ranges, obj.ranges.length - 1);
    else return sel;
  }

  function setSelectionReplaceHistory(doc, sel, options) {
    var done = doc.history.done, last = lst(done);
    if (last && last.ranges) {
      done[done.length - 1] = sel;
      setSelectionNoUndo(doc, sel, options);
    } else {
      setSelection(doc, sel, options);
    }
  }

  // Set a new selection.
  function setSelection(doc, sel, options) {
    setSelectionNoUndo(doc, sel, options);
    addSelectionToHistory(doc, doc.sel, doc.cm ? doc.cm.curOp.id : NaN, options);
  }

  function setSelectionNoUndo(doc, sel, options) {
    if (hasHandler(doc, "beforeSelectionChange") || doc.cm && hasHandler(doc.cm, "beforeSelectionChange"))
      sel = filterSelectionChange(doc, sel);

    var bias = options && options.bias ||
      (cmp(sel.primary().head, doc.sel.primary().head) < 0 ? -1 : 1);
    setSelectionInner(doc, skipAtomicInSelection(doc, sel, bias, true));

    if (!(options && options.scroll === false) && doc.cm)
      ensureCursorVisible(doc.cm);
  }

  function setSelectionInner(doc, sel) {
    if (sel.equals(doc.sel)) return;

    doc.sel = sel;

    if (doc.cm) {
      doc.cm.curOp.updateInput = doc.cm.curOp.selectionChanged = true;
      signalCursorActivity(doc.cm);
    }
    signalLater(doc, "cursorActivity", doc);
  }

  // Verify that the selection does not partially select any atomic
  // marked ranges.
  function reCheckSelection(doc) {
    setSelectionInner(doc, skipAtomicInSelection(doc, doc.sel, null, false), sel_dontScroll);
  }

  // Return a selection that does not partially select any atomic
  // ranges.
  function skipAtomicInSelection(doc, sel, bias, mayClear) {
    var out;
    for (var i = 0; i < sel.ranges.length; i++) {
      var range = sel.ranges[i];
      var newAnchor = skipAtomic(doc, range.anchor, bias, mayClear);
      var newHead = skipAtomic(doc, range.head, bias, mayClear);
      if (out || newAnchor != range.anchor || newHead != range.head) {
        if (!out) out = sel.ranges.slice(0, i);
        out[i] = new Range(newAnchor, newHead);
      }
    }
    return out ? normalizeSelection(out, sel.primIndex) : sel;
  }

  // Ensure a given position is not inside an atomic range.
  function skipAtomic(doc, pos, bias, mayClear) {
    var flipped = false, curPos = pos;
    var dir = bias || 1;
    doc.cantEdit = false;
    search: for (;;) {
      var line = getLine(doc, curPos.line);
      if (line.markedSpans) {
        for (var i = 0; i < line.markedSpans.length; ++i) {
          var sp = line.markedSpans[i], m = sp.marker;
          if ((sp.from == null || (m.inclusiveLeft ? sp.from <= curPos.ch : sp.from < curPos.ch)) &&
              (sp.to == null || (m.inclusiveRight ? sp.to >= curPos.ch : sp.to > curPos.ch))) {
            if (mayClear) {
              signal(m, "beforeCursorEnter");
              if (m.explicitlyCleared) {
                if (!line.markedSpans) break;
                else {--i; continue;}
              }
            }
            if (!m.atomic) continue;
            var newPos = m.find(dir < 0 ? -1 : 1);
            if (cmp(newPos, curPos) == 0) {
              newPos.ch += dir;
              if (newPos.ch < 0) {
                if (newPos.line > doc.first) newPos = clipPos(doc, Pos(newPos.line - 1));
                else newPos = null;
              } else if (newPos.ch > line.text.length) {
                if (newPos.line < doc.first + doc.size - 1) newPos = Pos(newPos.line + 1, 0);
                else newPos = null;
              }
              if (!newPos) {
                if (flipped) {
                  // Driven in a corner -- no valid cursor position found at all
                  // -- try again *with* clearing, if we didn't already
                  if (!mayClear) return skipAtomic(doc, pos, bias, true);
                  // Otherwise, turn off editing until further notice, and return the start of the doc
                  doc.cantEdit = true;
                  return Pos(doc.first, 0);
                }
                flipped = true; newPos = pos; dir = -dir;
              }
            }
            curPos = newPos;
            continue search;
          }
        }
      }
      return curPos;
    }
  }

  // SELECTION DRAWING

  function updateSelection(cm) {
    cm.display.input.showSelection(cm.display.input.prepareSelection());
  }

  function prepareSelection(cm, primary) {
    var doc = cm.doc, result = {};
    var curFragment = result.cursors = document.createDocumentFragment();
    var selFragment = result.selection = document.createDocumentFragment();

    for (var i = 0; i < doc.sel.ranges.length; i++) {
      if (primary === false && i == doc.sel.primIndex) continue;
      var range = doc.sel.ranges[i];
      var collapsed = range.empty();
      if (collapsed || cm.options.showCursorWhenSelecting)
        drawSelectionCursor(cm, range.head, curFragment);
      if (!collapsed)
        drawSelectionRange(cm, range, selFragment);
    }
    return result;
  }

  // Draws a cursor for the given range
  function drawSelectionCursor(cm, head, output) {
    var pos = cursorCoords(cm, head, "div", null, null, !cm.options.singleCursorHeightPerLine);

    var cursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor"));
    cursor.style.left = pos.left + "px";
    cursor.style.top = pos.top + "px";
    cursor.style.height = Math.max(0, pos.bottom - pos.top) * cm.options.cursorHeight + "px";

    if (pos.other) {
      // Secondary cursor, shown when on a 'jump' in bi-directional text
      var otherCursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor CodeMirror-secondarycursor"));
      otherCursor.style.display = "";
      otherCursor.style.left = pos.other.left + "px";
      otherCursor.style.top = pos.other.top + "px";
      otherCursor.style.height = (pos.other.bottom - pos.other.top) * .85 + "px";
    }
  }

  // Draws the given range as a highlighted selection
  function drawSelectionRange(cm, range, output) {
    var display = cm.display, doc = cm.doc;
    var fragment = document.createDocumentFragment();
    var padding = paddingH(cm.display), leftSide = padding.left;
    var rightSide = Math.max(display.sizerWidth, displayWidth(cm) - display.sizer.offsetLeft) - padding.right;

    function add(left, top, width, bottom) {
      if (top < 0) top = 0;
      top = Math.round(top);
      bottom = Math.round(bottom);
      fragment.appendChild(elt("div", null, "CodeMirror-selected", "position: absolute; left: " + left +
                               "px; top: " + top + "px; width: " + (width == null ? rightSide - left : width) +
                               "px; height: " + (bottom - top) + "px"));
    }

    function drawForLine(line, fromArg, toArg) {
      var lineObj = getLine(doc, line);
      var lineLen = lineObj.text.length;
      var start, end;
      function coords(ch, bias) {
        return charCoords(cm, Pos(line, ch), "div", lineObj, bias);
      }

      iterateBidiSections(getOrder(lineObj), fromArg || 0, toArg == null ? lineLen : toArg, function(from, to, dir) {
        var leftPos = coords(from, "left"), rightPos, left, right;
        if (from == to) {
          rightPos = leftPos;
          left = right = leftPos.left;
        } else {
          rightPos = coords(to - 1, "right");
          if (dir == "rtl") { var tmp = leftPos; leftPos = rightPos; rightPos = tmp; }
          left = leftPos.left;
          right = rightPos.right;
        }
        if (fromArg == null && from == 0) left = leftSide;
        if (rightPos.top - leftPos.top > 3) { // Different lines, draw top part
          add(left, leftPos.top, null, leftPos.bottom);
          left = leftSide;
          if (leftPos.bottom < rightPos.top) add(left, leftPos.bottom, null, rightPos.top);
        }
        if (toArg == null && to == lineLen) right = rightSide;
        if (!start || leftPos.top < start.top || leftPos.top == start.top && leftPos.left < start.left)
          start = leftPos;
        if (!end || rightPos.bottom > end.bottom || rightPos.bottom == end.bottom && rightPos.right > end.right)
          end = rightPos;
        if (left < leftSide + 1) left = leftSide;
        add(left, rightPos.top, right - left, rightPos.bottom);
      });
      return {start: start, end: end};
    }

    var sFrom = range.from(), sTo = range.to();
    if (sFrom.line == sTo.line) {
      drawForLine(sFrom.line, sFrom.ch, sTo.ch);
    } else {
      var fromLine = getLine(doc, sFrom.line), toLine = getLine(doc, sTo.line);
      var singleVLine = visualLine(fromLine) == visualLine(toLine);
      var leftEnd = drawForLine(sFrom.line, sFrom.ch, singleVLine ? fromLine.text.length + 1 : null).end;
      var rightStart = drawForLine(sTo.line, singleVLine ? 0 : null, sTo.ch).start;
      if (singleVLine) {
        if (leftEnd.top < rightStart.top - 2) {
          add(leftEnd.right, leftEnd.top, null, leftEnd.bottom);
          add(leftSide, rightStart.top, rightStart.left, rightStart.bottom);
        } else {
          add(leftEnd.right, leftEnd.top, rightStart.left - leftEnd.right, leftEnd.bottom);
        }
      }
      if (leftEnd.bottom < rightStart.top)
        add(leftSide, leftEnd.bottom, null, rightStart.top);
    }

    output.appendChild(fragment);
  }

  // Cursor-blinking
  function restartBlink(cm) {
    if (!cm.state.focused) return;
    var display = cm.display;
    clearInterval(display.blinker);
    var on = true;
    display.cursorDiv.style.visibility = "";
    if (cm.options.cursorBlinkRate > 0)
      display.blinker = setInterval(function() {
        display.cursorDiv.style.visibility = (on = !on) ? "" : "hidden";
      }, cm.options.cursorBlinkRate);
    else if (cm.options.cursorBlinkRate < 0)
      display.cursorDiv.style.visibility = "hidden";
  }

  // HIGHLIGHT WORKER

  function startWorker(cm, time) {
    if (cm.doc.mode.startState && cm.doc.frontier < cm.display.viewTo)
      cm.state.highlight.set(time, bind(highlightWorker, cm));
  }

  function highlightWorker(cm) {
    var doc = cm.doc;
    if (doc.frontier < doc.first) doc.frontier = doc.first;
    if (doc.frontier >= cm.display.viewTo) return;
    var end = +new Date + cm.options.workTime;
    var state = copyState(doc.mode, getStateBefore(cm, doc.frontier));
    var changedLines = [];

    doc.iter(doc.frontier, Math.min(doc.first + doc.size, cm.display.viewTo + 500), function(line) {
      if (doc.frontier >= cm.display.viewFrom) { // Visible
        var oldStyles = line.styles, tooLong = line.text.length > cm.options.maxHighlightLength;
        var highlighted = highlightLine(cm, line, tooLong ? copyState(doc.mode, state) : state, true);
        line.styles = highlighted.styles;
        var oldCls = line.styleClasses, newCls = highlighted.classes;
        if (newCls) line.styleClasses = newCls;
        else if (oldCls) line.styleClasses = null;
        var ischange = !oldStyles || oldStyles.length != line.styles.length ||
          oldCls != newCls && (!oldCls || !newCls || oldCls.bgClass != newCls.bgClass || oldCls.textClass != newCls.textClass);
        for (var i = 0; !ischange && i < oldStyles.length; ++i) ischange = oldStyles[i] != line.styles[i];
        if (ischange) changedLines.push(doc.frontier);
        line.stateAfter = tooLong ? state : copyState(doc.mode, state);
      } else {
        if (line.text.length <= cm.options.maxHighlightLength)
          processLine(cm, line.text, state);
        line.stateAfter = doc.frontier % 5 == 0 ? copyState(doc.mode, state) : null;
      }
      ++doc.frontier;
      if (+new Date > end) {
        startWorker(cm, cm.options.workDelay);
        return true;
      }
    });
    if (changedLines.length) runInOp(cm, function() {
      for (var i = 0; i < changedLines.length; i++)
        regLineChange(cm, changedLines[i], "text");
    });
  }

  // Finds the line to start with when starting a parse. Tries to
  // find a line with a stateAfter, so that it can start with a
  // valid state. If that fails, it returns the line with the
  // smallest indentation, which tends to need the least context to
  // parse correctly.
  function findStartLine(cm, n, precise) {
    var minindent, minline, doc = cm.doc;
    var lim = precise ? -1 : n - (cm.doc.mode.innerMode ? 1000 : 100);
    for (var search = n; search > lim; --search) {
      if (search <= doc.first) return doc.first;
      var line = getLine(doc, search - 1);
      if (line.stateAfter && (!precise || search <= doc.frontier)) return search;
      var indented = countColumn(line.text, null, cm.options.tabSize);
      if (minline == null || minindent > indented) {
        minline = search - 1;
        minindent = indented;
      }
    }
    return minline;
  }

  function getStateBefore(cm, n, precise) {
    var doc = cm.doc, display = cm.display;
    if (!doc.mode.startState) return true;
    var pos = findStartLine(cm, n, precise), state = pos > doc.first && getLine(doc, pos-1).stateAfter;
    if (!state) state = startState(doc.mode);
    else state = copyState(doc.mode, state);
    doc.iter(pos, n, function(line) {
      processLine(cm, line.text, state);
      var save = pos == n - 1 || pos % 5 == 0 || pos >= display.viewFrom && pos < display.viewTo;
      line.stateAfter = save ? copyState(doc.mode, state) : null;
      ++pos;
    });
    if (precise) doc.frontier = pos;
    return state;
  }

  // POSITION MEASUREMENT

  function paddingTop(display) {return display.lineSpace.offsetTop;}
  function paddingVert(display) {return display.mover.offsetHeight - display.lineSpace.offsetHeight;}
  function paddingH(display) {
    if (display.cachedPaddingH) return display.cachedPaddingH;
    var e = removeChildrenAndAdd(display.measure, elt("pre", "x"));
    var style = window.getComputedStyle ? window.getComputedStyle(e) : e.currentStyle;
    var data = {left: parseInt(style.paddingLeft), right: parseInt(style.paddingRight)};
    if (!isNaN(data.left) && !isNaN(data.right)) display.cachedPaddingH = data;
    return data;
  }

  function scrollGap(cm) { return scrollerGap - cm.display.nativeBarWidth; }
  function displayWidth(cm) {
    return cm.display.scroller.clientWidth - scrollGap(cm) - cm.display.barWidth;
  }
  function displayHeight(cm) {
    return cm.display.scroller.clientHeight - scrollGap(cm) - cm.display.barHeight;
  }

  // Ensure the lineView.wrapping.heights array is populated. This is
  // an array of bottom offsets for the lines that make up a drawn
  // line. When lineWrapping is on, there might be more than one
  // height.
  function ensureLineHeights(cm, lineView, rect) {
    var wrapping = cm.options.lineWrapping;
    var curWidth = wrapping && displayWidth(cm);
    if (!lineView.measure.heights || wrapping && lineView.measure.width != curWidth) {
      var heights = lineView.measure.heights = [];
      if (wrapping) {
        lineView.measure.width = curWidth;
        var rects = lineView.text.firstChild.getClientRects();
        for (var i = 0; i < rects.length - 1; i++) {
          var cur = rects[i], next = rects[i + 1];
          if (Math.abs(cur.bottom - next.bottom) > 2)
            heights.push((cur.bottom + next.top) / 2 - rect.top);
        }
      }
      heights.push(rect.bottom - rect.top);
    }
  }

  // Find a line map (mapping character offsets to text nodes) and a
  // measurement cache for the given line number. (A line view might
  // contain multiple lines when collapsed ranges are present.)
  function mapFromLineView(lineView, line, lineN) {
    if (lineView.line == line)
      return {map: lineView.measure.map, cache: lineView.measure.cache};
    for (var i = 0; i < lineView.rest.length; i++)
      if (lineView.rest[i] == line)
        return {map: lineView.measure.maps[i], cache: lineView.measure.caches[i]};
    for (var i = 0; i < lineView.rest.length; i++)
      if (lineNo(lineView.rest[i]) > lineN)
        return {map: lineView.measure.maps[i], cache: lineView.measure.caches[i], before: true};
  }

  // Render a line into the hidden node display.externalMeasured. Used
  // when measurement is needed for a line that's not in the viewport.
  function updateExternalMeasurement(cm, line) {
    line = visualLine(line);
    var lineN = lineNo(line);
    var view = cm.display.externalMeasured = new LineView(cm.doc, line, lineN);
    view.lineN = lineN;
    var built = view.built = buildLineContent(cm, view);
    view.text = built.pre;
    removeChildrenAndAdd(cm.display.lineMeasure, built.pre);
    return view;
  }

  // Get a {top, bottom, left, right} box (in line-local coordinates)
  // for a given character.
  function measureChar(cm, line, ch, bias) {
    return measureCharPrepared(cm, prepareMeasureForLine(cm, line), ch, bias);
  }

  // Find a line view that corresponds to the given line number.
  function findViewForLine(cm, lineN) {
    if (lineN >= cm.display.viewFrom && lineN < cm.display.viewTo)
      return cm.display.view[findViewIndex(cm, lineN)];
    var ext = cm.display.externalMeasured;
    if (ext && lineN >= ext.lineN && lineN < ext.lineN + ext.size)
      return ext;
  }

  // Measurement can be split in two steps, the set-up work that
  // applies to the whole line, and the measurement of the actual
  // character. Functions like coordsChar, that need to do a lot of
  // measurements in a row, can thus ensure that the set-up work is
  // only done once.
  function prepareMeasureForLine(cm, line) {
    var lineN = lineNo(line);
    var view = findViewForLine(cm, lineN);
    if (view && !view.text) {
      view = null;
    } else if (view && view.changes) {
      updateLineForChanges(cm, view, lineN, getDimensions(cm));
      cm.curOp.forceUpdate = true;
    }
    if (!view)
      view = updateExternalMeasurement(cm, line);

    var info = mapFromLineView(view, line, lineN);
    return {
      line: line, view: view, rect: null,
      map: info.map, cache: info.cache, before: info.before,
      hasHeights: false
    };
  }

  // Given a prepared measurement object, measures the position of an
  // actual character (or fetches it from the cache).
  function measureCharPrepared(cm, prepared, ch, bias, varHeight) {
    if (prepared.before) ch = -1;
    var key = ch + (bias || ""), found;
    if (prepared.cache.hasOwnProperty(key)) {
      found = prepared.cache[key];
    } else {
      if (!prepared.rect)
        prepared.rect = prepared.view.text.getBoundingClientRect();
      if (!prepared.hasHeights) {
        ensureLineHeights(cm, prepared.view, prepared.rect);
        prepared.hasHeights = true;
      }
      found = measureCharInner(cm, prepared, ch, bias);
      if (!found.bogus) prepared.cache[key] = found;
    }
    return {left: found.left, right: found.right,
            top: varHeight ? found.rtop : found.top,
            bottom: varHeight ? found.rbottom : found.bottom};
  }

  var nullRect = {left: 0, right: 0, top: 0, bottom: 0};

  function nodeAndOffsetInLineMap(map, ch, bias) {
    var node, start, end, collapse;
    // First, search the line map for the text node corresponding to,
    // or closest to, the target character.
    for (var i = 0; i < map.length; i += 3) {
      var mStart = map[i], mEnd = map[i + 1];
      if (ch < mStart) {
        start = 0; end = 1;
        collapse = "left";
      } else if (ch < mEnd) {
        start = ch - mStart;
        end = start + 1;
      } else if (i == map.length - 3 || ch == mEnd && map[i + 3] > ch) {
        end = mEnd - mStart;
        start = end - 1;
        if (ch >= mEnd) collapse = "right";
      }
      if (start != null) {
        node = map[i + 2];
        if (mStart == mEnd && bias == (node.insertLeft ? "left" : "right"))
          collapse = bias;
        if (bias == "left" && start == 0)
          while (i && map[i - 2] == map[i - 3] && map[i - 1].insertLeft) {
            node = map[(i -= 3) + 2];
            collapse = "left";
          }
        if (bias == "right" && start == mEnd - mStart)
          while (i < map.length - 3 && map[i + 3] == map[i + 4] && !map[i + 5].insertLeft) {
            node = map[(i += 3) + 2];
            collapse = "right";
          }
        break;
      }
    }
    return {node: node, start: start, end: end, collapse: collapse, coverStart: mStart, coverEnd: mEnd};
  }

  function measureCharInner(cm, prepared, ch, bias) {
    var place = nodeAndOffsetInLineMap(prepared.map, ch, bias);
    var node = place.node, start = place.start, end = place.end, collapse = place.collapse;

    var rect;
    if (node.nodeType == 3) { // If it is a text node, use a range to retrieve the coordinates.
      for (var i = 0; i < 4; i++) { // Retry a maximum of 4 times when nonsense rectangles are returned
        while (start && isExtendingChar(prepared.line.text.charAt(place.coverStart + start))) --start;
        while (place.coverStart + end < place.coverEnd && isExtendingChar(prepared.line.text.charAt(place.coverStart + end))) ++end;
        if (ie && ie_version < 9 && start == 0 && end == place.coverEnd - place.coverStart) {
          rect = node.parentNode.getBoundingClientRect();
        } else if (ie && cm.options.lineWrapping) {
          var rects = range(node, start, end).getClientRects();
          if (rects.length)
            rect = rects[bias == "right" ? rects.length - 1 : 0];
          else
            rect = nullRect;
        } else {
          rect = range(node, start, end).getBoundingClientRect() || nullRect;
        }
        if (rect.left || rect.right || start == 0) break;
        end = start;
        start = start - 1;
        collapse = "right";
      }
      if (ie && ie_version < 11) rect = maybeUpdateRectForZooming(cm.display.measure, rect);
    } else { // If it is a widget, simply get the box for the whole widget.
      if (start > 0) collapse = bias = "right";
      var rects;
      if (cm.options.lineWrapping && (rects = node.getClientRects()).length > 1)
        rect = rects[bias == "right" ? rects.length - 1 : 0];
      else
        rect = node.getBoundingClientRect();
    }
    if (ie && ie_version < 9 && !start && (!rect || !rect.left && !rect.right)) {
      var rSpan = node.parentNode.getClientRects()[0];
      if (rSpan)
        rect = {left: rSpan.left, right: rSpan.left + charWidth(cm.display), top: rSpan.top, bottom: rSpan.bottom};
      else
        rect = nullRect;
    }

    var rtop = rect.top - prepared.rect.top, rbot = rect.bottom - prepared.rect.top;
    var mid = (rtop + rbot) / 2;
    var heights = prepared.view.measure.heights;
    for (var i = 0; i < heights.length - 1; i++)
      if (mid < heights[i]) break;
    var top = i ? heights[i - 1] : 0, bot = heights[i];
    var result = {left: (collapse == "right" ? rect.right : rect.left) - prepared.rect.left,
                  right: (collapse == "left" ? rect.left : rect.right) - prepared.rect.left,
                  top: top, bottom: bot};
    if (!rect.left && !rect.right) result.bogus = true;
    if (!cm.options.singleCursorHeightPerLine) { result.rtop = rtop; result.rbottom = rbot; }

    return result;
  }

  // Work around problem with bounding client rects on ranges being
  // returned incorrectly when zoomed on IE10 and below.
  function maybeUpdateRectForZooming(measure, rect) {
    if (!window.screen || screen.logicalXDPI == null ||
        screen.logicalXDPI == screen.deviceXDPI || !hasBadZoomedRects(measure))
      return rect;
    var scaleX = screen.logicalXDPI / screen.deviceXDPI;
    var scaleY = screen.logicalYDPI / screen.deviceYDPI;
    return {left: rect.left * scaleX, right: rect.right * scaleX,
            top: rect.top * scaleY, bottom: rect.bottom * scaleY};
  }

  function clearLineMeasurementCacheFor(lineView) {
    if (lineView.measure) {
      lineView.measure.cache = {};
      lineView.measure.heights = null;
      if (lineView.rest) for (var i = 0; i < lineView.rest.length; i++)
        lineView.measure.caches[i] = {};
    }
  }

  function clearLineMeasurementCache(cm) {
    cm.display.externalMeasure = null;
    removeChildren(cm.display.lineMeasure);
    for (var i = 0; i < cm.display.view.length; i++)
      clearLineMeasurementCacheFor(cm.display.view[i]);
  }

  function clearCaches(cm) {
    clearLineMeasurementCache(cm);
    cm.display.cachedCharWidth = cm.display.cachedTextHeight = cm.display.cachedPaddingH = null;
    if (!cm.options.lineWrapping) cm.display.maxLineChanged = true;
    cm.display.lineNumChars = null;
  }

  function pageScrollX() { return window.pageXOffset || (document.documentElement || document.body).scrollLeft; }
  function pageScrollY() { return window.pageYOffset || (document.documentElement || document.body).scrollTop; }

  // Converts a {top, bottom, left, right} box from line-local
  // coordinates into another coordinate system. Context may be one of
  // "line", "div" (display.lineDiv), "local"/null (editor), "window",
  // or "page".
  function intoCoordSystem(cm, lineObj, rect, context) {
    if (lineObj.widgets) for (var i = 0; i < lineObj.widgets.length; ++i) if (lineObj.widgets[i].above) {
      var size = widgetHeight(lineObj.widgets[i]);
      rect.top += size; rect.bottom += size;
    }
    if (context == "line") return rect;
    if (!context) context = "local";
    var yOff = heightAtLine(lineObj);
    if (context == "local") yOff += paddingTop(cm.display);
    else yOff -= cm.display.viewOffset;
    if (context == "page" || context == "window") {
      var lOff = cm.display.lineSpace.getBoundingClientRect();
      yOff += lOff.top + (context == "window" ? 0 : pageScrollY());
      var xOff = lOff.left + (context == "window" ? 0 : pageScrollX());
      rect.left += xOff; rect.right += xOff;
    }
    rect.top += yOff; rect.bottom += yOff;
    return rect;
  }

  // Coverts a box from "div" coords to another coordinate system.
  // Context may be "window", "page", "div", or "local"/null.
  function fromCoordSystem(cm, coords, context) {
    if (context == "div") return coords;
    var left = coords.left, top = coords.top;
    // First move into "page" coordinate system
    if (context == "page") {
      left -= pageScrollX();
      top -= pageScrollY();
    } else if (context == "local" || !context) {
      var localBox = cm.display.sizer.getBoundingClientRect();
      left += localBox.left;
      top += localBox.top;
    }

    var lineSpaceBox = cm.display.lineSpace.getBoundingClientRect();
    return {left: left - lineSpaceBox.left, top: top - lineSpaceBox.top};
  }

  function charCoords(cm, pos, context, lineObj, bias) {
    if (!lineObj) lineObj = getLine(cm.doc, pos.line);
    return intoCoordSystem(cm, lineObj, measureChar(cm, lineObj, pos.ch, bias), context);
  }

  // Returns a box for a given cursor position, which may have an
  // 'other' property containing the position of the secondary cursor
  // on a bidi boundary.
  function cursorCoords(cm, pos, context, lineObj, preparedMeasure, varHeight) {
    lineObj = lineObj || getLine(cm.doc, pos.line);
    if (!preparedMeasure) preparedMeasure = prepareMeasureForLine(cm, lineObj);
    function get(ch, right) {
      var m = measureCharPrepared(cm, preparedMeasure, ch, right ? "right" : "left", varHeight);
      if (right) m.left = m.right; else m.right = m.left;
      return intoCoordSystem(cm, lineObj, m, context);
    }
    function getBidi(ch, partPos) {
      var part = order[partPos], right = part.level % 2;
      if (ch == bidiLeft(part) && partPos && part.level < order[partPos - 1].level) {
        part = order[--partPos];
        ch = bidiRight(part) - (part.level % 2 ? 0 : 1);
        right = true;
      } else if (ch == bidiRight(part) && partPos < order.length - 1 && part.level < order[partPos + 1].level) {
        part = order[++partPos];
        ch = bidiLeft(part) - part.level % 2;
        right = false;
      }
      if (right && ch == part.to && ch > part.from) return get(ch - 1);
      return get(ch, right);
    }
    var order = getOrder(lineObj), ch = pos.ch;
    if (!order) return get(ch);
    var partPos = getBidiPartAt(order, ch);
    var val = getBidi(ch, partPos);
    if (bidiOther != null) val.other = getBidi(ch, bidiOther);
    return val;
  }

  // Used to cheaply estimate the coordinates for a position. Used for
  // intermediate scroll updates.
  function estimateCoords(cm, pos) {
    var left = 0, pos = clipPos(cm.doc, pos);
    if (!cm.options.lineWrapping) left = charWidth(cm.display) * pos.ch;
    var lineObj = getLine(cm.doc, pos.line);
    var top = heightAtLine(lineObj) + paddingTop(cm.display);
    return {left: left, right: left, top: top, bottom: top + lineObj.height};
  }

  // Positions returned by coordsChar contain some extra information.
  // xRel is the relative x position of the input coordinates compared
  // to the found position (so xRel > 0 means the coordinates are to
  // the right of the character position, for example). When outside
  // is true, that means the coordinates lie outside the line's
  // vertical range.
  function PosWithInfo(line, ch, outside, xRel) {
    var pos = Pos(line, ch);
    pos.xRel = xRel;
    if (outside) pos.outside = true;
    return pos;
  }

  // Compute the character position closest to the given coordinates.
  // Input must be lineSpace-local ("div" coordinate system).
  function coordsChar(cm, x, y) {
    var doc = cm.doc;
    y += cm.display.viewOffset;
    if (y < 0) return PosWithInfo(doc.first, 0, true, -1);
    var lineN = lineAtHeight(doc, y), last = doc.first + doc.size - 1;
    if (lineN > last)
      return PosWithInfo(doc.first + doc.size - 1, getLine(doc, last).text.length, true, 1);
    if (x < 0) x = 0;

    var lineObj = getLine(doc, lineN);
    for (;;) {
      var found = coordsCharInner(cm, lineObj, lineN, x, y);
      var merged = collapsedSpanAtEnd(lineObj);
      var mergedPos = merged && merged.find(0, true);
      if (merged && (found.ch > mergedPos.from.ch || found.ch == mergedPos.from.ch && found.xRel > 0))
        lineN = lineNo(lineObj = mergedPos.to.line);
      else
        return found;
    }
  }

  function coordsCharInner(cm, lineObj, lineNo, x, y) {
    var innerOff = y - heightAtLine(lineObj);
    var wrongLine = false, adjust = 2 * cm.display.wrapper.clientWidth;
    var preparedMeasure = prepareMeasureForLine(cm, lineObj);

    function getX(ch) {
      var sp = cursorCoords(cm, Pos(lineNo, ch), "line", lineObj, preparedMeasure);
      wrongLine = true;
      if (innerOff > sp.bottom) return sp.left - adjust;
      else if (innerOff < sp.top) return sp.left + adjust;
      else wrongLine = false;
      return sp.left;
    }

    var bidi = getOrder(lineObj), dist = lineObj.text.length;
    var from = lineLeft(lineObj), to = lineRight(lineObj);
    var fromX = getX(from), fromOutside = wrongLine, toX = getX(to), toOutside = wrongLine;

    if (x > toX) return PosWithInfo(lineNo, to, toOutside, 1);
    // Do a binary search between these bounds.
    for (;;) {
      if (bidi ? to == from || to == moveVisually(lineObj, from, 1) : to - from <= 1) {
        var ch = x < fromX || x - fromX <= toX - x ? from : to;
        var xDiff = x - (ch == from ? fromX : toX);
        while (isExtendingChar(lineObj.text.charAt(ch))) ++ch;
        var pos = PosWithInfo(lineNo, ch, ch == from ? fromOutside : toOutside,
                              xDiff < -1 ? -1 : xDiff > 1 ? 1 : 0);
        return pos;
      }
      var step = Math.ceil(dist / 2), middle = from + step;
      if (bidi) {
        middle = from;
        for (var i = 0; i < step; ++i) middle = moveVisually(lineObj, middle, 1);
      }
      var middleX = getX(middle);
      if (middleX > x) {to = middle; toX = middleX; if (toOutside = wrongLine) toX += 1000; dist = step;}
      else {from = middle; fromX = middleX; fromOutside = wrongLine; dist -= step;}
    }
  }

  var measureText;
  // Compute the default text height.
  function textHeight(display) {
    if (display.cachedTextHeight != null) return display.cachedTextHeight;
    if (measureText == null) {
      measureText = elt("pre");
      // Measure a bunch of lines, for browsers that compute
      // fractional heights.
      for (var i = 0; i < 49; ++i) {
        measureText.appendChild(document.createTextNode("x"));
        measureText.appendChild(elt("br"));
      }
      measureText.appendChild(document.createTextNode("x"));
    }
    removeChildrenAndAdd(display.measure, measureText);
    var height = measureText.offsetHeight / 50;
    if (height > 3) display.cachedTextHeight = height;
    removeChildren(display.measure);
    return height || 1;
  }

  // Compute the default character width.
  function charWidth(display) {
    if (display.cachedCharWidth != null) return display.cachedCharWidth;
    var anchor = elt("span", "xxxxxxxxxx");
    var pre = elt("pre", [anchor]);
    removeChildrenAndAdd(display.measure, pre);
    var rect = anchor.getBoundingClientRect(), width = (rect.right - rect.left) / 10;
    if (width > 2) display.cachedCharWidth = width;
    return width || 10;
  }

  // OPERATIONS

  // Operations are used to wrap a series of changes to the editor
  // state in such a way that each change won't have to update the
  // cursor and display (which would be awkward, slow, and
  // error-prone). Instead, display updates are batched and then all
  // combined and executed at once.

  var operationGroup = null;

  var nextOpId = 0;
  // Start a new operation.
  function startOperation(cm) {
    cm.curOp = {
      cm: cm,
      viewChanged: false,      // Flag that indicates that lines might need to be redrawn
      startHeight: cm.doc.height, // Used to detect need to update scrollbar
      forceUpdate: false,      // Used to force a redraw
      updateInput: null,       // Whether to reset the input textarea
      typing: false,           // Whether this reset should be careful to leave existing text (for compositing)
      changeObjs: null,        // Accumulated changes, for firing change events
      cursorActivityHandlers: null, // Set of handlers to fire cursorActivity on
      cursorActivityCalled: 0, // Tracks which cursorActivity handlers have been called already
      selectionChanged: false, // Whether the selection needs to be redrawn
      updateMaxLine: false,    // Set when the widest line needs to be determined anew
      scrollLeft: null, scrollTop: null, // Intermediate scroll position, not pushed to DOM yet
      scrollToPos: null,       // Used to scroll to a specific position
      focus: false,
      id: ++nextOpId           // Unique ID
    };
    if (operationGroup) {
      operationGroup.ops.push(cm.curOp);
    } else {
      cm.curOp.ownsGroup = operationGroup = {
        ops: [cm.curOp],
        delayedCallbacks: []
      };
    }
  }

  function fireCallbacksForOps(group) {
    // Calls delayed callbacks and cursorActivity handlers until no
    // new ones appear
    var callbacks = group.delayedCallbacks, i = 0;
    do {
      for (; i < callbacks.length; i++)
        callbacks[i].call(null);
      for (var j = 0; j < group.ops.length; j++) {
        var op = group.ops[j];
        if (op.cursorActivityHandlers)
          while (op.cursorActivityCalled < op.cursorActivityHandlers.length)
            op.cursorActivityHandlers[op.cursorActivityCalled++].call(null, op.cm);
      }
    } while (i < callbacks.length);
  }

  // Finish an operation, updating the display and signalling delayed events
  function endOperation(cm) {
    var op = cm.curOp, group = op.ownsGroup;
    if (!group) return;

    try { fireCallbacksForOps(group); }
    finally {
      operationGroup = null;
      for (var i = 0; i < group.ops.length; i++)
        group.ops[i].cm.curOp = null;
      endOperations(group);
    }
  }

  // The DOM updates done when an operation finishes are batched so
  // that the minimum number of relayouts are required.
  function endOperations(group) {
    var ops = group.ops;
    for (var i = 0; i < ops.length; i++) // Read DOM
      endOperation_R1(ops[i]);
    for (var i = 0; i < ops.length; i++) // Write DOM (maybe)
      endOperation_W1(ops[i]);
    for (var i = 0; i < ops.length; i++) // Read DOM
      endOperation_R2(ops[i]);
    for (var i = 0; i < ops.length; i++) // Write DOM (maybe)
      endOperation_W2(ops[i]);
    for (var i = 0; i < ops.length; i++) // Read DOM
      endOperation_finish(ops[i]);
  }

  function endOperation_R1(op) {
    var cm = op.cm, display = cm.display;
    maybeClipScrollbars(cm);
    if (op.updateMaxLine) findMaxLine(cm);

    op.mustUpdate = op.viewChanged || op.forceUpdate || op.scrollTop != null ||
      op.scrollToPos && (op.scrollToPos.from.line < display.viewFrom ||
                         op.scrollToPos.to.line >= display.viewTo) ||
      display.maxLineChanged && cm.options.lineWrapping;
    op.update = op.mustUpdate &&
      new DisplayUpdate(cm, op.mustUpdate && {top: op.scrollTop, ensure: op.scrollToPos}, op.forceUpdate);
  }

  function endOperation_W1(op) {
    op.updatedDisplay = op.mustUpdate && updateDisplayIfNeeded(op.cm, op.update);
  }

  function endOperation_R2(op) {
    var cm = op.cm, display = cm.display;
    if (op.updatedDisplay) updateHeightsInViewport(cm);

    op.barMeasure = measureForScrollbars(cm);

    // If the max line changed since it was last measured, measure it,
    // and ensure the document's width matches it.
    // updateDisplay_W2 will use these properties to do the actual resizing
    if (display.maxLineChanged && !cm.options.lineWrapping) {
      op.adjustWidthTo = measureChar(cm, display.maxLine, display.maxLine.text.length).left + 3;
      cm.display.sizerWidth = op.adjustWidthTo;
      op.barMeasure.scrollWidth =
        Math.max(display.scroller.clientWidth, display.sizer.offsetLeft + op.adjustWidthTo + scrollGap(cm) + cm.display.barWidth);
      op.maxScrollLeft = Math.max(0, display.sizer.offsetLeft + op.adjustWidthTo - displayWidth(cm));
    }

    if (op.updatedDisplay || op.selectionChanged)
      op.preparedSelection = display.input.prepareSelection();
  }

  function endOperation_W2(op) {
    var cm = op.cm;

    if (op.adjustWidthTo != null) {
      cm.display.sizer.style.minWidth = op.adjustWidthTo + "px";
      if (op.maxScrollLeft < cm.doc.scrollLeft)
        setScrollLeft(cm, Math.min(cm.display.scroller.scrollLeft, op.maxScrollLeft), true);
      cm.display.maxLineChanged = false;
    }

    if (op.preparedSelection)
      cm.display.input.showSelection(op.preparedSelection);
    if (op.updatedDisplay)
      setDocumentHeight(cm, op.barMeasure);
    if (op.updatedDisplay || op.startHeight != cm.doc.height)
      updateScrollbars(cm, op.barMeasure);

    if (op.selectionChanged) restartBlink(cm);

    if (cm.state.focused && op.updateInput)
      cm.display.input.reset(op.typing);
    if (op.focus && op.focus == activeElt() && (!document.hasFocus || document.hasFocus()))
      ensureFocus(op.cm);
  }

  function endOperation_finish(op) {
    var cm = op.cm, display = cm.display, doc = cm.doc;

    if (op.updatedDisplay) postUpdateDisplay(cm, op.update);

    // Abort mouse wheel delta measurement, when scrolling explicitly
    if (display.wheelStartX != null && (op.scrollTop != null || op.scrollLeft != null || op.scrollToPos))
      display.wheelStartX = display.wheelStartY = null;

    // Propagate the scroll position to the actual DOM scroller
    if (op.scrollTop != null && (display.scroller.scrollTop != op.scrollTop || op.forceScroll)) {
      doc.scrollTop = Math.max(0, Math.min(display.scroller.scrollHeight - display.scroller.clientHeight, op.scrollTop));
      display.scrollbars.setScrollTop(doc.scrollTop);
      display.scroller.scrollTop = doc.scrollTop;
    }
    if (op.scrollLeft != null && (display.scroller.scrollLeft != op.scrollLeft || op.forceScroll)) {
      doc.scrollLeft = Math.max(0, Math.min(display.scroller.scrollWidth - displayWidth(cm), op.scrollLeft));
      display.scrollbars.setScrollLeft(doc.scrollLeft);
      display.scroller.scrollLeft = doc.scrollLeft;
      alignHorizontally(cm);
    }
    // If we need to scroll a specific position into view, do so.
    if (op.scrollToPos) {
      var coords = scrollPosIntoView(cm, clipPos(doc, op.scrollToPos.from),
                                     clipPos(doc, op.scrollToPos.to), op.scrollToPos.margin);
      if (op.scrollToPos.isCursor && cm.state.focused) maybeScrollWindow(cm, coords);
    }

    // Fire events for markers that are hidden/unidden by editing or
    // undoing
    var hidden = op.maybeHiddenMarkers, unhidden = op.maybeUnhiddenMarkers;
    if (hidden) for (var i = 0; i < hidden.length; ++i)
      if (!hidden[i].lines.length) signal(hidden[i], "hide");
    if (unhidden) for (var i = 0; i < unhidden.length; ++i)
      if (unhidden[i].lines.length) signal(unhidden[i], "unhide");

    if (display.wrapper.offsetHeight)
      doc.scrollTop = cm.display.scroller.scrollTop;

    // Fire change events, and delayed event handlers
    if (op.changeObjs)
      signal(cm, "changes", cm, op.changeObjs);
    if (op.update)
      op.update.finish();
  }

  // Run the given function in an operation
  function runInOp(cm, f) {
    if (cm.curOp) return f();
    startOperation(cm);
    try { return f(); }
    finally { endOperation(cm); }
  }
  // Wraps a function in an operation. Returns the wrapped function.
  function operation(cm, f) {
    return function() {
      if (cm.curOp) return f.apply(cm, arguments);
      startOperation(cm);
      try { return f.apply(cm, arguments); }
      finally { endOperation(cm); }
    };
  }
  // Used to add methods to editor and doc instances, wrapping them in
  // operations.
  function methodOp(f) {
    return function() {
      if (this.curOp) return f.apply(this, arguments);
      startOperation(this);
      try { return f.apply(this, arguments); }
      finally { endOperation(this); }
    };
  }
  function docMethodOp(f) {
    return function() {
      var cm = this.cm;
      if (!cm || cm.curOp) return f.apply(this, arguments);
      startOperation(cm);
      try { return f.apply(this, arguments); }
      finally { endOperation(cm); }
    };
  }

  // VIEW TRACKING

  // These objects are used to represent the visible (currently drawn)
  // part of the document. A LineView may correspond to multiple
  // logical lines, if those are connected by collapsed ranges.
  function LineView(doc, line, lineN) {
    // The starting line
    this.line = line;
    // Continuing lines, if any
    this.rest = visualLineContinued(line);
    // Number of logical lines in this visual line
    this.size = this.rest ? lineNo(lst(this.rest)) - lineN + 1 : 1;
    this.node = this.text = null;
    this.hidden = lineIsHidden(doc, line);
  }

  // Create a range of LineView objects for the given lines.
  function buildViewArray(cm, from, to) {
    var array = [], nextPos;
    for (var pos = from; pos < to; pos = nextPos) {
      var view = new LineView(cm.doc, getLine(cm.doc, pos), pos);
      nextPos = pos + view.size;
      array.push(view);
    }
    return array;
  }

  // Updates the display.view data structure for a given change to the
  // document. From and to are in pre-change coordinates. Lendiff is
  // the amount of lines added or subtracted by the change. This is
  // used for changes that span multiple lines, or change the way
  // lines are divided into visual lines. regLineChange (below)
  // registers single-line changes.
  function regChange(cm, from, to, lendiff) {
    if (from == null) from = cm.doc.first;
    if (to == null) to = cm.doc.first + cm.doc.size;
    if (!lendiff) lendiff = 0;

    var display = cm.display;
    if (lendiff && to < display.viewTo &&
        (display.updateLineNumbers == null || display.updateLineNumbers > from))
      display.updateLineNumbers = from;

    cm.curOp.viewChanged = true;

    if (from >= display.viewTo) { // Change after
      if (sawCollapsedSpans && visualLineNo(cm.doc, from) < display.viewTo)
        resetView(cm);
    } else if (to <= display.viewFrom) { // Change before
      if (sawCollapsedSpans && visualLineEndNo(cm.doc, to + lendiff) > display.viewFrom) {
        resetView(cm);
      } else {
        display.viewFrom += lendiff;
        display.viewTo += lendiff;
      }
    } else if (from <= display.viewFrom && to >= display.viewTo) { // Full overlap
      resetView(cm);
    } else if (from <= display.viewFrom) { // Top overlap
      var cut = viewCuttingPoint(cm, to, to + lendiff, 1);
      if (cut) {
        display.view = display.view.slice(cut.index);
        display.viewFrom = cut.lineN;
        display.viewTo += lendiff;
      } else {
        resetView(cm);
      }
    } else if (to >= display.viewTo) { // Bottom overlap
      var cut = viewCuttingPoint(cm, from, from, -1);
      if (cut) {
        display.view = display.view.slice(0, cut.index);
        display.viewTo = cut.lineN;
      } else {
        resetView(cm);
      }
    } else { // Gap in the middle
      var cutTop = viewCuttingPoint(cm, from, from, -1);
      var cutBot = viewCuttingPoint(cm, to, to + lendiff, 1);
      if (cutTop && cutBot) {
        display.view = display.view.slice(0, cutTop.index)
          .concat(buildViewArray(cm, cutTop.lineN, cutBot.lineN))
          .concat(display.view.slice(cutBot.index));
        display.viewTo += lendiff;
      } else {
        resetView(cm);
      }
    }

    var ext = display.externalMeasured;
    if (ext) {
      if (to < ext.lineN)
        ext.lineN += lendiff;
      else if (from < ext.lineN + ext.size)
        display.externalMeasured = null;
    }
  }

  // Register a change to a single line. Type must be one of "text",
  // "gutter", "class", "widget"
  function regLineChange(cm, line, type) {
    cm.curOp.viewChanged = true;
    var display = cm.display, ext = cm.display.externalMeasured;
    if (ext && line >= ext.lineN && line < ext.lineN + ext.size)
      display.externalMeasured = null;

    if (line < display.viewFrom || line >= display.viewTo) return;
    var lineView = display.view[findViewIndex(cm, line)];
    if (lineView.node == null) return;
    var arr = lineView.changes || (lineView.changes = []);
    if (indexOf(arr, type) == -1) arr.push(type);
  }

  // Clear the view.
  function resetView(cm) {
    cm.display.viewFrom = cm.display.viewTo = cm.doc.first;
    cm.display.view = [];
    cm.display.viewOffset = 0;
  }

  // Find the view element corresponding to a given line. Return null
  // when the line isn't visible.
  function findViewIndex(cm, n) {
    if (n >= cm.display.viewTo) return null;
    n -= cm.display.viewFrom;
    if (n < 0) return null;
    var view = cm.display.view;
    for (var i = 0; i < view.length; i++) {
      n -= view[i].size;
      if (n < 0) return i;
    }
  }

  function viewCuttingPoint(cm, oldN, newN, dir) {
    var index = findViewIndex(cm, oldN), diff, view = cm.display.view;
    if (!sawCollapsedSpans || newN == cm.doc.first + cm.doc.size)
      return {index: index, lineN: newN};
    for (var i = 0, n = cm.display.viewFrom; i < index; i++)
      n += view[i].size;
    if (n != oldN) {
      if (dir > 0) {
        if (index == view.length - 1) return null;
        diff = (n + view[index].size) - oldN;
        index++;
      } else {
        diff = n - oldN;
      }
      oldN += diff; newN += diff;
    }
    while (visualLineNo(cm.doc, newN) != newN) {
      if (index == (dir < 0 ? 0 : view.length - 1)) return null;
      newN += dir * view[index - (dir < 0 ? 1 : 0)].size;
      index += dir;
    }
    return {index: index, lineN: newN};
  }

  // Force the view to cover a given range, adding empty view element
  // or clipping off existing ones as needed.
  function adjustView(cm, from, to) {
    var display = cm.display, view = display.view;
    if (view.length == 0 || from >= display.viewTo || to <= display.viewFrom) {
      display.view = buildViewArray(cm, from, to);
      display.viewFrom = from;
    } else {
      if (display.viewFrom > from)
        display.view = buildViewArray(cm, from, display.viewFrom).concat(display.view);
      else if (display.viewFrom < from)
        display.view = display.view.slice(findViewIndex(cm, from));
      display.viewFrom = from;
      if (display.viewTo < to)
        display.view = display.view.concat(buildViewArray(cm, display.viewTo, to));
      else if (display.viewTo > to)
        display.view = display.view.slice(0, findViewIndex(cm, to));
    }
    display.viewTo = to;
  }

  // Count the number of lines in the view whose DOM representation is
  // out of date (or nonexistent).
  function countDirtyView(cm) {
    var view = cm.display.view, dirty = 0;
    for (var i = 0; i < view.length; i++) {
      var lineView = view[i];
      if (!lineView.hidden && (!lineView.node || lineView.changes)) ++dirty;
    }
    return dirty;
  }

  // EVENT HANDLERS

  // Attach the necessary event handlers when initializing the editor
  function registerEventHandlers(cm) {
    var d = cm.display;
    on(d.scroller, "mousedown", operation(cm, onMouseDown));
    // Older IE's will not fire a second mousedown for a double click
    if (ie && ie_version < 11)
      on(d.scroller, "dblclick", operation(cm, function(e) {
        if (signalDOMEvent(cm, e)) return;
        var pos = posFromMouse(cm, e);
        if (!pos || clickInGutter(cm, e) || eventInWidget(cm.display, e)) return;
        e_preventDefault(e);
        var word = cm.findWordAt(pos);
        extendSelection(cm.doc, word.anchor, word.head);
      }));
    else
      on(d.scroller, "dblclick", function(e) { signalDOMEvent(cm, e) || e_preventDefault(e); });
    // Some browsers fire contextmenu *after* opening the menu, at
    // which point we can't mess with it anymore. Context menu is
    // handled in onMouseDown for these browsers.
    if (!captureRightClick) on(d.scroller, "contextmenu", function(e) {onContextMenu(cm, e);});

    // Used to suppress mouse event handling when a touch happens
    var touchFinished, prevTouch = {end: 0};
    function finishTouch() {
      if (d.activeTouch) {
        touchFinished = setTimeout(function() {d.activeTouch = null;}, 1000);
        prevTouch = d.activeTouch;
        prevTouch.end = +new Date;
      }
    };
    function isMouseLikeTouchEvent(e) {
      if (e.touches.length != 1) return false;
      var touch = e.touches[0];
      return touch.radiusX <= 1 && touch.radiusY <= 1;
    }
    function farAway(touch, other) {
      if (other.left == null) return true;
      var dx = other.left - touch.left, dy = other.top - touch.top;
      return dx * dx + dy * dy > 20 * 20;
    }
    on(d.scroller, "touchstart", function(e) {
      if (!isMouseLikeTouchEvent(e)) {
        clearTimeout(touchFinished);
        var now = +new Date;
        d.activeTouch = {start: now, moved: false,
                         prev: now - prevTouch.end <= 300 ? prevTouch : null};
        if (e.touches.length == 1) {
          d.activeTouch.left = e.touches[0].pageX;
          d.activeTouch.top = e.touches[0].pageY;
        }
      }
    });
    on(d.scroller, "touchmove", function() {
      if (d.activeTouch) d.activeTouch.moved = true;
    });
    on(d.scroller, "touchend", function(e) {
      var touch = d.activeTouch;
      if (touch && !eventInWidget(d, e) && touch.left != null &&
          !touch.moved && new Date - touch.start < 300) {
        var pos = cm.coordsChar(d.activeTouch, "page"), range;
        if (!touch.prev || farAway(touch, touch.prev)) // Single tap
          range = new Range(pos, pos);
        else if (!touch.prev.prev || farAway(touch, touch.prev.prev)) // Double tap
          range = cm.findWordAt(pos);
        else // Triple tap
          range = new Range(Pos(pos.line, 0), clipPos(cm.doc, Pos(pos.line + 1, 0)));
        cm.setSelection(range.anchor, range.head);
        cm.focus();
        e_preventDefault(e);
      }
      finishTouch();
    });
    on(d.scroller, "touchcancel", finishTouch);

    // Sync scrolling between fake scrollbars and real scrollable
    // area, ensure viewport is updated when scrolling.
    on(d.scroller, "scroll", function() {
      if (d.scroller.clientHeight) {
        setScrollTop(cm, d.scroller.scrollTop);
        setScrollLeft(cm, d.scroller.scrollLeft, true);
        signal(cm, "scroll", cm);
      }
    });

    // Listen to wheel events in order to try and update the viewport on time.
    on(d.scroller, "mousewheel", function(e){onScrollWheel(cm, e);});
    on(d.scroller, "DOMMouseScroll", function(e){onScrollWheel(cm, e);});

    // Prevent wrapper from ever scrolling
    on(d.wrapper, "scroll", function() { d.wrapper.scrollTop = d.wrapper.scrollLeft = 0; });

    d.dragFunctions = {
      enter: function(e) {if (!signalDOMEvent(cm, e)) e_stop(e);},
      over: function(e) {if (!signalDOMEvent(cm, e)) { onDragOver(cm, e); e_stop(e); }},
      start: function(e){onDragStart(cm, e);},
      drop: operation(cm, onDrop),
      leave: function() {clearDragCursor(cm);}
    };

    var inp = d.input.getField();
    on(inp, "keyup", function(e) { onKeyUp.call(cm, e); });
    on(inp, "keydown", operation(cm, onKeyDown));
    on(inp, "keypress", operation(cm, onKeyPress));
    on(inp, "focus", bind(onFocus, cm));
    on(inp, "blur", bind(onBlur, cm));
  }

  function dragDropChanged(cm, value, old) {
    var wasOn = old && old != CodeMirror.Init;
    if (!value != !wasOn) {
      var funcs = cm.display.dragFunctions;
      var toggle = value ? on : off;
      toggle(cm.display.scroller, "dragstart", funcs.start);
      toggle(cm.display.scroller, "dragenter", funcs.enter);
      toggle(cm.display.scroller, "dragover", funcs.over);
      toggle(cm.display.scroller, "dragleave", funcs.leave);
      toggle(cm.display.scroller, "drop", funcs.drop);
    }
  }

  // Called when the window resizes
  function onResize(cm) {
    var d = cm.display;
    if (d.lastWrapHeight == d.wrapper.clientHeight && d.lastWrapWidth == d.wrapper.clientWidth)
      return;
    // Might be a text scaling operation, clear size caches.
    d.cachedCharWidth = d.cachedTextHeight = d.cachedPaddingH = null;
    d.scrollbarsClipped = false;
    cm.setSize();
  }

  // MOUSE EVENTS

  // Return true when the given mouse event happened in a widget
  function eventInWidget(display, e) {
    for (var n = e_target(e); n != display.wrapper; n = n.parentNode) {
      if (!n || (n.nodeType == 1 && n.getAttribute("cm-ignore-events") == "true") ||
          (n.parentNode == display.sizer && n != display.mover))
        return true;
    }
  }

  // Given a mouse event, find the corresponding position. If liberal
  // is false, it checks whether a gutter or scrollbar was clicked,
  // and returns null if it was. forRect is used by rectangular
  // selections, and tries to estimate a character position even for
  // coordinates beyond the right of the text.
  function posFromMouse(cm, e, liberal, forRect) {
    var display = cm.display;
    if (!liberal && e_target(e).getAttribute("cm-not-content") == "true") return null;

    var x, y, space = display.lineSpace.getBoundingClientRect();
    // Fails unpredictably on IE[67] when mouse is dragged around quickly.
    try { x = e.clientX - space.left; y = e.clientY - space.top; }
    catch (e) { return null; }
    var coords = coordsChar(cm, x, y), line;
    if (forRect && coords.xRel == 1 && (line = getLine(cm.doc, coords.line).text).length == coords.ch) {
      var colDiff = countColumn(line, line.length, cm.options.tabSize) - line.length;
      coords = Pos(coords.line, Math.max(0, Math.round((x - paddingH(cm.display).left) / charWidth(cm.display)) - colDiff));
    }
    return coords;
  }

  // A mouse down can be a single click, double click, triple click,
  // start of selection drag, start of text drag, new cursor
  // (ctrl-click), rectangle drag (alt-drag), or xwin
  // middle-click-paste. Or it might be a click on something we should
  // not interfere with, such as a scrollbar or widget.
  function onMouseDown(e) {
    var cm = this, display = cm.display;
    if (display.activeTouch && display.input.supportsTouch() || signalDOMEvent(cm, e)) return;
    display.shift = e.shiftKey;

    if (eventInWidget(display, e)) {
      if (!webkit) {
        // Briefly turn off draggability, to allow widgets to do
        // normal dragging things.
        display.scroller.draggable = false;
        setTimeout(function(){display.scroller.draggable = true;}, 100);
      }
      return;
    }
    if (clickInGutter(cm, e)) return;
    var start = posFromMouse(cm, e);
    window.focus();

    switch (e_button(e)) {
    case 1:
      // #3261: make sure, that we're not starting a second selection
      if (cm.state.selectingText)
        cm.state.selectingText(e);
      else if (start)
        leftButtonDown(cm, e, start);
      else if (e_target(e) == display.scroller)
        e_preventDefault(e);
      break;
    case 2:
      if (webkit) cm.state.lastMiddleDown = +new Date;
      if (start) extendSelection(cm.doc, start);
      setTimeout(function() {display.input.focus();}, 20);
      e_preventDefault(e);
      break;
    case 3:
      if (captureRightClick) onContextMenu(cm, e);
      else delayBlurEvent(cm);
      break;
    }
  }

  var lastClick, lastDoubleClick;
  function leftButtonDown(cm, e, start) {
    if (ie) setTimeout(bind(ensureFocus, cm), 0);
    else cm.curOp.focus = activeElt();

    var now = +new Date, type;
    if (lastDoubleClick && lastDoubleClick.time > now - 400 && cmp(lastDoubleClick.pos, start) == 0) {
      type = "triple";
    } else if (lastClick && lastClick.time > now - 400 && cmp(lastClick.pos, start) == 0) {
      type = "double";
      lastDoubleClick = {time: now, pos: start};
    } else {
      type = "single";
      lastClick = {time: now, pos: start};
    }

    var sel = cm.doc.sel, modifier = mac ? e.metaKey : e.ctrlKey, contained;
    if (cm.options.dragDrop && dragAndDrop && !isReadOnly(cm) &&
        type == "single" && (contained = sel.contains(start)) > -1 &&
        (cmp((contained = sel.ranges[contained]).from(), start) < 0 || start.xRel > 0) &&
        (cmp(contained.to(), start) > 0 || start.xRel < 0))
      leftButtonStartDrag(cm, e, start, modifier);
    else
      leftButtonSelect(cm, e, start, type, modifier);
  }

  // Start a text drag. When it ends, see if any dragging actually
  // happen, and treat as a click if it didn't.
  function leftButtonStartDrag(cm, e, start, modifier) {
    var display = cm.display, startTime = +new Date;
    var dragEnd = operation(cm, function(e2) {
      if (webkit) display.scroller.draggable = false;
      cm.state.draggingText = false;
      off(document, "mouseup", dragEnd);
      off(display.scroller, "drop", dragEnd);
      if (Math.abs(e.clientX - e2.clientX) + Math.abs(e.clientY - e2.clientY) < 10) {
        e_preventDefault(e2);
        if (!modifier && +new Date - 200 < startTime)
          extendSelection(cm.doc, start);
        // Work around unexplainable focus problem in IE9 (#2127) and Chrome (#3081)
        if (webkit || ie && ie_version == 9)
          setTimeout(function() {document.body.focus(); display.input.focus();}, 20);
        else
          display.input.focus();
      }
    });
    // Let the drag handler handle this.
    if (webkit) display.scroller.draggable = true;
    cm.state.draggingText = dragEnd;
    // IE's approach to draggable
    if (display.scroller.dragDrop) display.scroller.dragDrop();
    on(document, "mouseup", dragEnd);
    on(display.scroller, "drop", dragEnd);
  }

  // Normal selection, as opposed to text dragging.
  function leftButtonSelect(cm, e, start, type, addNew) {
    var display = cm.display, doc = cm.doc;
    e_preventDefault(e);

    var ourRange, ourIndex, startSel = doc.sel, ranges = startSel.ranges;
    if (addNew && !e.shiftKey) {
      ourIndex = doc.sel.contains(start);
      if (ourIndex > -1)
        ourRange = ranges[ourIndex];
      else
        ourRange = new Range(start, start);
    } else {
      ourRange = doc.sel.primary();
      ourIndex = doc.sel.primIndex;
    }

    if (e.altKey) {
      type = "rect";
      if (!addNew) ourRange = new Range(start, start);
      start = posFromMouse(cm, e, true, true);
      ourIndex = -1;
    } else if (type == "double") {
      var word = cm.findWordAt(start);
      if (cm.display.shift || doc.extend)
        ourRange = extendRange(doc, ourRange, word.anchor, word.head);
      else
        ourRange = word;
    } else if (type == "triple") {
      var line = new Range(Pos(start.line, 0), clipPos(doc, Pos(start.line + 1, 0)));
      if (cm.display.shift || doc.extend)
        ourRange = extendRange(doc, ourRange, line.anchor, line.head);
      else
        ourRange = line;
    } else {
      ourRange = extendRange(doc, ourRange, start);
    }

    if (!addNew) {
      ourIndex = 0;
      setSelection(doc, new Selection([ourRange], 0), sel_mouse);
      startSel = doc.sel;
    } else if (ourIndex == -1) {
      ourIndex = ranges.length;
      setSelection(doc, normalizeSelection(ranges.concat([ourRange]), ourIndex),
                   {scroll: false, origin: "*mouse"});
    } else if (ranges.length > 1 && ranges[ourIndex].empty() && type == "single" && !e.shiftKey) {
      setSelection(doc, normalizeSelection(ranges.slice(0, ourIndex).concat(ranges.slice(ourIndex + 1)), 0),
                   {scroll: false, origin: "*mouse"});
      startSel = doc.sel;
    } else {
      replaceOneSelection(doc, ourIndex, ourRange, sel_mouse);
    }

    var lastPos = start;
    function extendTo(pos) {
      if (cmp(lastPos, pos) == 0) return;
      lastPos = pos;

      if (type == "rect") {
        var ranges = [], tabSize = cm.options.tabSize;
        var startCol = countColumn(getLine(doc, start.line).text, start.ch, tabSize);
        var posCol = countColumn(getLine(doc, pos.line).text, pos.ch, tabSize);
        var left = Math.min(startCol, posCol), right = Math.max(startCol, posCol);
        for (var line = Math.min(start.line, pos.line), end = Math.min(cm.lastLine(), Math.max(start.line, pos.line));
             line <= end; line++) {
          var text = getLine(doc, line).text, leftPos = findColumn(text, left, tabSize);
          if (left == right)
            ranges.push(new Range(Pos(line, leftPos), Pos(line, leftPos)));
          else if (text.length > leftPos)
            ranges.push(new Range(Pos(line, leftPos), Pos(line, findColumn(text, right, tabSize))));
        }
        if (!ranges.length) ranges.push(new Range(start, start));
        setSelection(doc, normalizeSelection(startSel.ranges.slice(0, ourIndex).concat(ranges), ourIndex),
                     {origin: "*mouse", scroll: false});
        cm.scrollIntoView(pos);
      } else {
        var oldRange = ourRange;
        var anchor = oldRange.anchor, head = pos;
        if (type != "single") {
          if (type == "double")
            var range = cm.findWordAt(pos);
          else
            var range = new Range(Pos(pos.line, 0), clipPos(doc, Pos(pos.line + 1, 0)));
          if (cmp(range.anchor, anchor) > 0) {
            head = range.head;
            anchor = minPos(oldRange.from(), range.anchor);
          } else {
            head = range.anchor;
            anchor = maxPos(oldRange.to(), range.head);
          }
        }
        var ranges = startSel.ranges.slice(0);
        ranges[ourIndex] = new Range(clipPos(doc, anchor), head);
        setSelection(doc, normalizeSelection(ranges, ourIndex), sel_mouse);
      }
    }

    var editorSize = display.wrapper.getBoundingClientRect();
    // Used to ensure timeout re-tries don't fire when another extend
    // happened in the meantime (clearTimeout isn't reliable -- at
    // least on Chrome, the timeouts still happen even when cleared,
    // if the clear happens after their scheduled firing time).
    var counter = 0;

    function extend(e) {
      var curCount = ++counter;
      var cur = posFromMouse(cm, e, true, type == "rect");
      if (!cur) return;
      if (cmp(cur, lastPos) != 0) {
        cm.curOp.focus = activeElt();
        extendTo(cur);
        var visible = visibleLines(display, doc);
        if (cur.line >= visible.to || cur.line < visible.from)
          setTimeout(operation(cm, function(){if (counter == curCount) extend(e);}), 150);
      } else {
        var outside = e.clientY < editorSize.top ? -20 : e.clientY > editorSize.bottom ? 20 : 0;
        if (outside) setTimeout(operation(cm, function() {
          if (counter != curCount) return;
          display.scroller.scrollTop += outside;
          extend(e);
        }), 50);
      }
    }

    function done(e) {
      cm.state.selectingText = false;
      counter = Infinity;
      e_preventDefault(e);
      display.input.focus();
      off(document, "mousemove", move);
      off(document, "mouseup", up);
      doc.history.lastSelOrigin = null;
    }

    var move = operation(cm, function(e) {
      if (!e_button(e)) done(e);
      else extend(e);
    });
    var up = operation(cm, done);
    cm.state.selectingText = up;
    on(document, "mousemove", move);
    on(document, "mouseup", up);
  }

  // Determines whether an event happened in the gutter, and fires the
  // handlers for the corresponding event.
  function gutterEvent(cm, e, type, prevent) {
    try { var mX = e.clientX, mY = e.clientY; }
    catch(e) { return false; }
    if (mX >= Math.floor(cm.display.gutters.getBoundingClientRect().right)) return false;
    if (prevent) e_preventDefault(e);

    var display = cm.display;
    var lineBox = display.lineDiv.getBoundingClientRect();

    if (mY > lineBox.bottom || !hasHandler(cm, type)) return e_defaultPrevented(e);
    mY -= lineBox.top - display.viewOffset;

    for (var i = 0; i < cm.options.gutters.length; ++i) {
      var g = display.gutters.childNodes[i];
      if (g && g.getBoundingClientRect().right >= mX) {
        var line = lineAtHeight(cm.doc, mY);
        var gutter = cm.options.gutters[i];
        signal(cm, type, cm, line, gutter, e);
        return e_defaultPrevented(e);
      }
    }
  }

  function clickInGutter(cm, e) {
    return gutterEvent(cm, e, "gutterClick", true);
  }

  // Kludge to work around strange IE behavior where it'll sometimes
  // re-fire a series of drag-related events right after the drop (#1551)
  var lastDrop = 0;

  function onDrop(e) {
    var cm = this;
    clearDragCursor(cm);
    if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e))
      return;
    e_preventDefault(e);
    if (ie) lastDrop = +new Date;
    var pos = posFromMouse(cm, e, true), files = e.dataTransfer.files;
    if (!pos || isReadOnly(cm)) return;
    // Might be a file drop, in which case we simply extract the text
    // and insert it.
    if (files && files.length && window.FileReader && window.File) {
      var n = files.length, text = Array(n), read = 0;
      var loadFile = function(file, i) {
        if (cm.options.allowDropFileTypes &&
            indexOf(cm.options.allowDropFileTypes, file.type) == -1)
          return;

        var reader = new FileReader;
        reader.onload = operation(cm, function() {
          var content = reader.result;
          if (/[\x00-\x08\x0e-\x1f]{2}/.test(content)) content = "";
          text[i] = content;
          if (++read == n) {
            pos = clipPos(cm.doc, pos);
            var change = {from: pos, to: pos,
                          text: cm.doc.splitLines(text.join(cm.doc.lineSeparator())),
                          origin: "paste"};
            makeChange(cm.doc, change);
            setSelectionReplaceHistory(cm.doc, simpleSelection(pos, changeEnd(change)));
          }
        });
        reader.readAsText(file);
      };
      for (var i = 0; i < n; ++i) loadFile(files[i], i);
    } else { // Normal drop
      // Don't do a replace if the drop happened inside of the selected text.
      if (cm.state.draggingText && cm.doc.sel.contains(pos) > -1) {
        cm.state.draggingText(e);
        // Ensure the editor is re-focused
        setTimeout(function() {cm.display.input.focus();}, 20);
        return;
      }
      try {
        var text = e.dataTransfer.getData("Text");
        if (text) {
          if (cm.state.draggingText && !(mac ? e.altKey : e.ctrlKey))
            var selected = cm.listSelections();
          setSelectionNoUndo(cm.doc, simpleSelection(pos, pos));
          if (selected) for (var i = 0; i < selected.length; ++i)
            replaceRange(cm.doc, "", selected[i].anchor, selected[i].head, "drag");
          cm.replaceSelection(text, "around", "paste");
          cm.display.input.focus();
        }
      }
      catch(e){}
    }
  }

  function onDragStart(cm, e) {
    if (ie && (!cm.state.draggingText || +new Date - lastDrop < 100)) { e_stop(e); return; }
    if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e)) return;

    e.dataTransfer.setData("Text", cm.getSelection());

    // Use dummy image instead of default browsers image.
    // Recent Safari (~6.0.2) have a tendency to segfault when this happens, so we don't do it there.
    if (e.dataTransfer.setDragImage && !safari) {
      var img = elt("img", null, null, "position: fixed; left: 0; top: 0;");
      img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      if (presto) {
        img.width = img.height = 1;
        cm.display.wrapper.appendChild(img);
        // Force a relayout, or Opera won't use our image for some obscure reason
        img._top = img.offsetTop;
      }
      e.dataTransfer.setDragImage(img, 0, 0);
      if (presto) img.parentNode.removeChild(img);
    }
  }

  function onDragOver(cm, e) {
    var pos = posFromMouse(cm, e);
    if (!pos) return;
    var frag = document.createDocumentFragment();
    drawSelectionCursor(cm, pos, frag);
    if (!cm.display.dragCursor) {
      cm.display.dragCursor = elt("div", null, "CodeMirror-cursors CodeMirror-dragcursors");
      cm.display.lineSpace.insertBefore(cm.display.dragCursor, cm.display.cursorDiv);
    }
    removeChildrenAndAdd(cm.display.dragCursor, frag);
  }

  function clearDragCursor(cm) {
    if (cm.display.dragCursor) {
      cm.display.lineSpace.removeChild(cm.display.dragCursor);
      cm.display.dragCursor = null;
    }
  }

  // SCROLL EVENTS

  // Sync the scrollable area and scrollbars, ensure the viewport
  // covers the visible area.
  function setScrollTop(cm, val) {
    if (Math.abs(cm.doc.scrollTop - val) < 2) return;
    cm.doc.scrollTop = val;
    if (!gecko) updateDisplaySimple(cm, {top: val});
    if (cm.display.scroller.scrollTop != val) cm.display.scroller.scrollTop = val;
    cm.display.scrollbars.setScrollTop(val);
    if (gecko) updateDisplaySimple(cm);
    startWorker(cm, 100);
  }
  // Sync scroller and scrollbar, ensure the gutter elements are
  // aligned.
  function setScrollLeft(cm, val, isScroller) {
    if (isScroller ? val == cm.doc.scrollLeft : Math.abs(cm.doc.scrollLeft - val) < 2) return;
    val = Math.min(val, cm.display.scroller.scrollWidth - cm.display.scroller.clientWidth);
    cm.doc.scrollLeft = val;
    alignHorizontally(cm);
    if (cm.display.scroller.scrollLeft != val) cm.display.scroller.scrollLeft = val;
    cm.display.scrollbars.setScrollLeft(val);
  }

  // Since the delta values reported on mouse wheel events are
  // unstandardized between browsers and even browser versions, and
  // generally horribly unpredictable, this code starts by measuring
  // the scroll effect that the first few mouse wheel events have,
  // and, from that, detects the way it can convert deltas to pixel
  // offsets afterwards.
  //
  // The reason we want to know the amount a wheel event will scroll
  // is that it gives us a chance to update the display before the
  // actual scrolling happens, reducing flickering.

  var wheelSamples = 0, wheelPixelsPerUnit = null;
  // Fill in a browser-detected starting value on browsers where we
  // know one. These don't have to be accurate -- the result of them
  // being wrong would just be a slight flicker on the first wheel
  // scroll (if it is large enough).
  if (ie) wheelPixelsPerUnit = -.53;
  else if (gecko) wheelPixelsPerUnit = 15;
  else if (chrome) wheelPixelsPerUnit = -.7;
  else if (safari) wheelPixelsPerUnit = -1/3;

  var wheelEventDelta = function(e) {
    var dx = e.wheelDeltaX, dy = e.wheelDeltaY;
    if (dx == null && e.detail && e.axis == e.HORIZONTAL_AXIS) dx = e.detail;
    if (dy == null && e.detail && e.axis == e.VERTICAL_AXIS) dy = e.detail;
    else if (dy == null) dy = e.wheelDelta;
    return {x: dx, y: dy};
  };
  CodeMirror.wheelEventPixels = function(e) {
    var delta = wheelEventDelta(e);
    delta.x *= wheelPixelsPerUnit;
    delta.y *= wheelPixelsPerUnit;
    return delta;
  };

  function onScrollWheel(cm, e) {
    var delta = wheelEventDelta(e), dx = delta.x, dy = delta.y;

    var display = cm.display, scroll = display.scroller;
    // Quit if there's nothing to scroll here
    var canScrollX = scroll.scrollWidth > scroll.clientWidth;
    var canScrollY = scroll.scrollHeight > scroll.clientHeight;
    if (!(dx && canScrollX || dy && canScrollY)) return;

    // Webkit browsers on OS X abort momentum scrolls when the target
    // of the scroll event is removed from the scrollable element.
    // This hack (see related code in patchDisplay) makes sure the
    // element is kept around.
    if (dy && mac && webkit) {
      outer: for (var cur = e.target, view = display.view; cur != scroll; cur = cur.parentNode) {
        for (var i = 0; i < view.length; i++) {
          if (view[i].node == cur) {
            cm.display.currentWheelTarget = cur;
            break outer;
          }
        }
      }
    }

    // On some browsers, horizontal scrolling will cause redraws to
    // happen before the gutter has been realigned, causing it to
    // wriggle around in a most unseemly way. When we have an
    // estimated pixels/delta value, we just handle horizontal
    // scrolling entirely here. It'll be slightly off from native, but
    // better than glitching out.
    if (dx && !gecko && !presto && wheelPixelsPerUnit != null) {
      if (dy && canScrollY)
        setScrollTop(cm, Math.max(0, Math.min(scroll.scrollTop + dy * wheelPixelsPerUnit, scroll.scrollHeight - scroll.clientHeight)));
      setScrollLeft(cm, Math.max(0, Math.min(scroll.scrollLeft + dx * wheelPixelsPerUnit, scroll.scrollWidth - scroll.clientWidth)));
      // Only prevent default scrolling if vertical scrolling is
      // actually possible. Otherwise, it causes vertical scroll
      // jitter on OSX trackpads when deltaX is small and deltaY
      // is large (issue #3579)
      if (!dy || (dy && canScrollY))
        e_preventDefault(e);
      display.wheelStartX = null; // Abort measurement, if in progress
      return;
    }

    // 'Project' the visible viewport to cover the area that is being
    // scrolled into view (if we know enough to estimate it).
    if (dy && wheelPixelsPerUnit != null) {
      var pixels = dy * wheelPixelsPerUnit;
      var top = cm.doc.scrollTop, bot = top + display.wrapper.clientHeight;
      if (pixels < 0) top = Math.max(0, top + pixels - 50);
      else bot = Math.min(cm.doc.height, bot + pixels + 50);
      updateDisplaySimple(cm, {top: top, bottom: bot});
    }

    if (wheelSamples < 20) {
      if (display.wheelStartX == null) {
        display.wheelStartX = scroll.scrollLeft; display.wheelStartY = scroll.scrollTop;
        display.wheelDX = dx; display.wheelDY = dy;
        setTimeout(function() {
          if (display.wheelStartX == null) return;
          var movedX = scroll.scrollLeft - display.wheelStartX;
          var movedY = scroll.scrollTop - display.wheelStartY;
          var sample = (movedY && display.wheelDY && movedY / display.wheelDY) ||
            (movedX && display.wheelDX && movedX / display.wheelDX);
          display.wheelStartX = display.wheelStartY = null;
          if (!sample) return;
          wheelPixelsPerUnit = (wheelPixelsPerUnit * wheelSamples + sample) / (wheelSamples + 1);
          ++wheelSamples;
        }, 200);
      } else {
        display.wheelDX += dx; display.wheelDY += dy;
      }
    }
  }

  // KEY EVENTS

  // Run a handler that was bound to a key.
  function doHandleBinding(cm, bound, dropShift) {
    if (typeof bound == "string") {
      bound = commands[bound];
      if (!bound) return false;
    }
    // Ensure previous input has been read, so that the handler sees a
    // consistent view of the document
    cm.display.input.ensurePolled();
    var prevShift = cm.display.shift, done = false;
    try {
      if (isReadOnly(cm)) cm.state.suppressEdits = true;
      if (dropShift) cm.display.shift = false;
      done = bound(cm) != Pass;
    } finally {
      cm.display.shift = prevShift;
      cm.state.suppressEdits = false;
    }
    return done;
  }

  function lookupKeyForEditor(cm, name, handle) {
    for (var i = 0; i < cm.state.keyMaps.length; i++) {
      var result = lookupKey(name, cm.state.keyMaps[i], handle, cm);
      if (result) return result;
    }
    return (cm.options.extraKeys && lookupKey(name, cm.options.extraKeys, handle, cm))
      || lookupKey(name, cm.options.keyMap, handle, cm);
  }

  var stopSeq = new Delayed;
  function dispatchKey(cm, name, e, handle) {
    var seq = cm.state.keySeq;
    if (seq) {
      if (isModifierKey(name)) return "handled";
      stopSeq.set(50, function() {
        if (cm.state.keySeq == seq) {
          cm.state.keySeq = null;
          cm.display.input.reset();
        }
      });
      name = seq + " " + name;
    }
    var result = lookupKeyForEditor(cm, name, handle);

    if (result == "multi")
      cm.state.keySeq = name;
    if (result == "handled")
      signalLater(cm, "keyHandled", cm, name, e);

    if (result == "handled" || result == "multi") {
      e_preventDefault(e);
      restartBlink(cm);
    }

    if (seq && !result && /\'$/.test(name)) {
      e_preventDefault(e);
      return true;
    }
    return !!result;
  }

  // Handle a key from the keydown event.
  function handleKeyBinding(cm, e) {
    var name = keyName(e, true);
    if (!name) return false;

    if (e.shiftKey && !cm.state.keySeq) {
      // First try to resolve full name (including 'Shift-'). Failing
      // that, see if there is a cursor-motion command (starting with
      // 'go') bound to the keyname without 'Shift-'.
      return dispatchKey(cm, "Shift-" + name, e, function(b) {return doHandleBinding(cm, b, true);})
          || dispatchKey(cm, name, e, function(b) {
               if (typeof b == "string" ? /^go[A-Z]/.test(b) : b.motion)
                 return doHandleBinding(cm, b);
             });
    } else {
      return dispatchKey(cm, name, e, function(b) { return doHandleBinding(cm, b); });
    }
  }

  // Handle a key from the keypress event
  function handleCharBinding(cm, e, ch) {
    return dispatchKey(cm, "'" + ch + "'", e,
                       function(b) { return doHandleBinding(cm, b, true); });
  }

  var lastStoppedKey = null;
  function onKeyDown(e) {
    var cm = this;
    cm.curOp.focus = activeElt();
    if (signalDOMEvent(cm, e)) return;
    // IE does strange things with escape.
    if (ie && ie_version < 11 && e.keyCode == 27) e.returnValue = false;
    var code = e.keyCode;
    cm.display.shift = code == 16 || e.shiftKey;
    var handled = handleKeyBinding(cm, e);
    if (presto) {
      lastStoppedKey = handled ? code : null;
      // Opera has no cut event... we try to at least catch the key combo
      if (!handled && code == 88 && !hasCopyEvent && (mac ? e.metaKey : e.ctrlKey))
        cm.replaceSelection("", null, "cut");
    }

    // Turn mouse into crosshair when Alt is held on Mac.
    if (code == 18 && !/\bCodeMirror-crosshair\b/.test(cm.display.lineDiv.className))
      showCrossHair(cm);
  }

  function showCrossHair(cm) {
    var lineDiv = cm.display.lineDiv;
    addClass(lineDiv, "CodeMirror-crosshair");

    function up(e) {
      if (e.keyCode == 18 || !e.altKey) {
        rmClass(lineDiv, "CodeMirror-crosshair");
        off(document, "keyup", up);
        off(document, "mouseover", up);
      }
    }
    on(document, "keyup", up);
    on(document, "mouseover", up);
  }

  function onKeyUp(e) {
    if (e.keyCode == 16) this.doc.sel.shift = false;
    signalDOMEvent(this, e);
  }

  function onKeyPress(e) {
    var cm = this;
    if (eventInWidget(cm.display, e) || signalDOMEvent(cm, e) || e.ctrlKey && !e.altKey || mac && e.metaKey) return;
    var keyCode = e.keyCode, charCode = e.charCode;
    if (presto && keyCode == lastStoppedKey) {lastStoppedKey = null; e_preventDefault(e); return;}
    if ((presto && (!e.which || e.which < 10)) && handleKeyBinding(cm, e)) return;
    var ch = String.fromCharCode(charCode == null ? keyCode : charCode);
    if (handleCharBinding(cm, e, ch)) return;
    cm.display.input.onKeyPress(e);
  }

  // FOCUS/BLUR EVENTS

  function delayBlurEvent(cm) {
    cm.state.delayingBlurEvent = true;
    setTimeout(function() {
      if (cm.state.delayingBlurEvent) {
        cm.state.delayingBlurEvent = false;
        onBlur(cm);
      }
    }, 100);
  }

  function onFocus(cm) {
    if (cm.state.delayingBlurEvent) cm.state.delayingBlurEvent = false;

    if (cm.options.readOnly == "nocursor") return;
    if (!cm.state.focused) {
      signal(cm, "focus", cm);
      cm.state.focused = true;
      addClass(cm.display.wrapper, "CodeMirror-focused");
      // This test prevents this from firing when a context
      // menu is closed (since the input reset would kill the
      // select-all detection hack)
      if (!cm.curOp && cm.display.selForContextMenu != cm.doc.sel) {
        cm.display.input.reset();
        if (webkit) setTimeout(function() { cm.display.input.reset(true); }, 20); // Issue #1730
      }
      cm.display.input.receivedFocus();
    }
    restartBlink(cm);
  }
  function onBlur(cm) {
    if (cm.state.delayingBlurEvent) return;

    if (cm.state.focused) {
      signal(cm, "blur", cm);
      cm.state.focused = false;
      rmClass(cm.display.wrapper, "CodeMirror-focused");
    }
    clearInterval(cm.display.blinker);
    setTimeout(function() {if (!cm.state.focused) cm.display.shift = false;}, 150);
  }

  // CONTEXT MENU HANDLING

  // To make the context menu work, we need to briefly unhide the
  // textarea (making it as unobtrusive as possible) to let the
  // right-click take effect on it.
  function onContextMenu(cm, e) {
    if (eventInWidget(cm.display, e) || contextMenuInGutter(cm, e)) return;
    if (signalDOMEvent(cm, e, "contextmenu")) return;
    cm.display.input.onContextMenu(e);
  }

  function contextMenuInGutter(cm, e) {
    if (!hasHandler(cm, "gutterContextMenu")) return false;
    return gutterEvent(cm, e, "gutterContextMenu", false);
  }

  // UPDATING

  // Compute the position of the end of a change (its 'to' property
  // refers to the pre-change end).
  var changeEnd = CodeMirror.changeEnd = function(change) {
    if (!change.text) return change.to;
    return Pos(change.from.line + change.text.length - 1,
               lst(change.text).length + (change.text.length == 1 ? change.from.ch : 0));
  };

  // Adjust a position to refer to the post-change position of the
  // same text, or the end of the change if the change covers it.
  function adjustForChange(pos, change) {
    if (cmp(pos, change.from) < 0) return pos;
    if (cmp(pos, change.to) <= 0) return changeEnd(change);

    var line = pos.line + change.text.length - (change.to.line - change.from.line) - 1, ch = pos.ch;
    if (pos.line == change.to.line) ch += changeEnd(change).ch - change.to.ch;
    return Pos(line, ch);
  }

  function computeSelAfterChange(doc, change) {
    var out = [];
    for (var i = 0; i < doc.sel.ranges.length; i++) {
      var range = doc.sel.ranges[i];
      out.push(new Range(adjustForChange(range.anchor, change),
                         adjustForChange(range.head, change)));
    }
    return normalizeSelection(out, doc.sel.primIndex);
  }

  function offsetPos(pos, old, nw) {
    if (pos.line == old.line)
      return Pos(nw.line, pos.ch - old.ch + nw.ch);
    else
      return Pos(nw.line + (pos.line - old.line), pos.ch);
  }

  // Used by replaceSelections to allow moving the selection to the
  // start or around the replaced test. Hint may be "start" or "around".
  function computeReplacedSel(doc, changes, hint) {
    var out = [];
    var oldPrev = Pos(doc.first, 0), newPrev = oldPrev;
    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      var from = offsetPos(change.from, oldPrev, newPrev);
      var to = offsetPos(changeEnd(change), oldPrev, newPrev);
      oldPrev = change.to;
      newPrev = to;
      if (hint == "around") {
        var range = doc.sel.ranges[i], inv = cmp(range.head, range.anchor) < 0;
        out[i] = new Range(inv ? to : from, inv ? from : to);
      } else {
        out[i] = new Range(from, from);
      }
    }
    return new Selection(out, doc.sel.primIndex);
  }

  // Allow "beforeChange" event handlers to influence a change
  function filterChange(doc, change, update) {
    var obj = {
      canceled: false,
      from: change.from,
      to: change.to,
      text: change.text,
      origin: change.origin,
      cancel: function() { this.canceled = true; }
    };
    if (update) obj.update = function(from, to, text, origin) {
      if (from) this.from = clipPos(doc, from);
      if (to) this.to = clipPos(doc, to);
      if (text) this.text = text;
      if (origin !== undefined) this.origin = origin;
    };
    signal(doc, "beforeChange", doc, obj);
    if (doc.cm) signal(doc.cm, "beforeChange", doc.cm, obj);

    if (obj.canceled) return null;
    return {from: obj.from, to: obj.to, text: obj.text, origin: obj.origin};
  }

  // Apply a change to a document, and add it to the document's
  // history, and propagating it to all linked documents.
  function makeChange(doc, change, ignoreReadOnly) {
    if (doc.cm) {
      if (!doc.cm.curOp) return operation(doc.cm, makeChange)(doc, change, ignoreReadOnly);
      if (doc.cm.state.suppressEdits) return;
    }

    if (hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange")) {
      change = filterChange(doc, change, true);
      if (!change) return;
    }

    // Possibly split or suppress the update based on the presence
    // of read-only spans in its range.
    var split = sawReadOnlySpans && !ignoreReadOnly && removeReadOnlyRanges(doc, change.from, change.to);
    if (split) {
      for (var i = split.length - 1; i >= 0; --i)
        makeChangeInner(doc, {from: split[i].from, to: split[i].to, text: i ? [""] : change.text});
    } else {
      makeChangeInner(doc, change);
    }
  }

  function makeChangeInner(doc, change) {
    if (change.text.length == 1 && change.text[0] == "" && cmp(change.from, change.to) == 0) return;
    var selAfter = computeSelAfterChange(doc, change);
    addChangeToHistory(doc, change, selAfter, doc.cm ? doc.cm.curOp.id : NaN);

    makeChangeSingleDoc(doc, change, selAfter, stretchSpansOverChange(doc, change));
    var rebased = [];

    linkedDocs(doc, function(doc, sharedHist) {
      if (!sharedHist && indexOf(rebased, doc.history) == -1) {
        rebaseHist(doc.history, change);
        rebased.push(doc.history);
      }
      makeChangeSingleDoc(doc, change, null, stretchSpansOverChange(doc, change));
    });
  }

  // Revert a change stored in a document's history.
  function makeChangeFromHistory(doc, type, allowSelectionOnly) {
    if (doc.cm && doc.cm.state.suppressEdits) return;

    var hist = doc.history, event, selAfter = doc.sel;
    var source = type == "undo" ? hist.done : hist.undone, dest = type == "undo" ? hist.undone : hist.done;

    // Verify that there is a useable event (so that ctrl-z won't
    // needlessly clear selection events)
    for (var i = 0; i < source.length; i++) {
      event = source[i];
      if (allowSelectionOnly ? event.ranges && !event.equals(doc.sel) : !event.ranges)
        break;
    }
    if (i == source.length) return;
    hist.lastOrigin = hist.lastSelOrigin = null;

    for (;;) {
      event = source.pop();
      if (event.ranges) {
        pushSelectionToHistory(event, dest);
        if (allowSelectionOnly && !event.equals(doc.sel)) {
          setSelection(doc, event, {clearRedo: false});
          return;
        }
        selAfter = event;
      }
      else break;
    }

    // Build up a reverse change object to add to the opposite history
    // stack (redo when undoing, and vice versa).
    var antiChanges = [];
    pushSelectionToHistory(selAfter, dest);
    dest.push({changes: antiChanges, generation: hist.generation});
    hist.generation = event.generation || ++hist.maxGeneration;

    var filter = hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange");

    for (var i = event.changes.length - 1; i >= 0; --i) {
      var change = event.changes[i];
      change.origin = type;
      if (filter && !filterChange(doc, change, false)) {
        source.length = 0;
        return;
      }

      antiChanges.push(historyChangeFromChange(doc, change));

      var after = i ? computeSelAfterChange(doc, change) : lst(source);
      makeChangeSingleDoc(doc, change, after, mergeOldSpans(doc, change));
      if (!i && doc.cm) doc.cm.scrollIntoView({from: change.from, to: changeEnd(change)});
      var rebased = [];

      // Propagate to the linked documents
      linkedDocs(doc, function(doc, sharedHist) {
        if (!sharedHist && indexOf(rebased, doc.history) == -1) {
          rebaseHist(doc.history, change);
          rebased.push(doc.history);
        }
        makeChangeSingleDoc(doc, change, null, mergeOldSpans(doc, change));
      });
    }
  }

  // Sub-views need their line numbers shifted when text is added
  // above or below them in the parent document.
  function shiftDoc(doc, distance) {
    if (distance == 0) return;
    doc.first += distance;
    doc.sel = new Selection(map(doc.sel.ranges, function(range) {
      return new Range(Pos(range.anchor.line + distance, range.anchor.ch),
                       Pos(range.head.line + distance, range.head.ch));
    }), doc.sel.primIndex);
    if (doc.cm) {
      regChange(doc.cm, doc.first, doc.first - distance, distance);
      for (var d = doc.cm.display, l = d.viewFrom; l < d.viewTo; l++)
        regLineChange(doc.cm, l, "gutter");
    }
  }

  // More lower-level change function, handling only a single document
  // (not linked ones).
  function makeChangeSingleDoc(doc, change, selAfter, spans) {
    if (doc.cm && !doc.cm.curOp)
      return operation(doc.cm, makeChangeSingleDoc)(doc, change, selAfter, spans);

    if (change.to.line < doc.first) {
      shiftDoc(doc, change.text.length - 1 - (change.to.line - change.from.line));
      return;
    }
    if (change.from.line > doc.lastLine()) return;

    // Clip the change to the size of this doc
    if (change.from.line < doc.first) {
      var shift = change.text.length - 1 - (doc.first - change.from.line);
      shiftDoc(doc, shift);
      change = {from: Pos(doc.first, 0), to: Pos(change.to.line + shift, change.to.ch),
                text: [lst(change.text)], origin: change.origin};
    }
    var last = doc.lastLine();
    if (change.to.line > last) {
      change = {from: change.from, to: Pos(last, getLine(doc, last).text.length),
                text: [change.text[0]], origin: change.origin};
    }

    change.removed = getBetween(doc, change.from, change.to);

    if (!selAfter) selAfter = computeSelAfterChange(doc, change);
    if (doc.cm) makeChangeSingleDocInEditor(doc.cm, change, spans);
    else updateDoc(doc, change, spans);
    setSelectionNoUndo(doc, selAfter, sel_dontScroll);
  }

  // Handle the interaction of a change to a document with the editor
  // that this document is part of.
  function makeChangeSingleDocInEditor(cm, change, spans) {
    var doc = cm.doc, display = cm.display, from = change.from, to = change.to;

    var recomputeMaxLength = false, checkWidthStart = from.line;
    if (!cm.options.lineWrapping) {
      checkWidthStart = lineNo(visualLine(getLine(doc, from.line)));
      doc.iter(checkWidthStart, to.line + 1, function(line) {
        if (line == display.maxLine) {
          recomputeMaxLength = true;
          return true;
        }
      });
    }

    if (doc.sel.contains(change.from, change.to) > -1)
      signalCursorActivity(cm);

    updateDoc(doc, change, spans, estimateHeight(cm));

    if (!cm.options.lineWrapping) {
      doc.iter(checkWidthStart, from.line + change.text.length, function(line) {
        var len = lineLength(line);
        if (len > display.maxLineLength) {
          display.maxLine = line;
          display.maxLineLength = len;
          display.maxLineChanged = true;
          recomputeMaxLength = false;
        }
      });
      if (recomputeMaxLength) cm.curOp.updateMaxLine = true;
    }

    // Adjust frontier, schedule worker
    doc.frontier = Math.min(doc.frontier, from.line);
    startWorker(cm, 400);

    var lendiff = change.text.length - (to.line - from.line) - 1;
    // Remember that these lines changed, for updating the display
    if (change.full)
      regChange(cm);
    else if (from.line == to.line && change.text.length == 1 && !isWholeLineUpdate(cm.doc, change))
      regLineChange(cm, from.line, "text");
    else
      regChange(cm, from.line, to.line + 1, lendiff);

    var changesHandler = hasHandler(cm, "changes"), changeHandler = hasHandler(cm, "change");
    if (changeHandler || changesHandler) {
      var obj = {
        from: from, to: to,
        text: change.text,
        removed: change.removed,
        origin: change.origin
      };
      if (changeHandler) signalLater(cm, "change", cm, obj);
      if (changesHandler) (cm.curOp.changeObjs || (cm.curOp.changeObjs = [])).push(obj);
    }
    cm.display.selForContextMenu = null;
  }

  function replaceRange(doc, code, from, to, origin) {
    if (!to) to = from;
    if (cmp(to, from) < 0) { var tmp = to; to = from; from = tmp; }
    if (typeof code == "string") code = doc.splitLines(code);
    makeChange(doc, {from: from, to: to, text: code, origin: origin});
  }

  // SCROLLING THINGS INTO VIEW

  // If an editor sits on the top or bottom of the window, partially
  // scrolled out of view, this ensures that the cursor is visible.
  function maybeScrollWindow(cm, coords) {
    if (signalDOMEvent(cm, "scrollCursorIntoView")) return;

    var display = cm.display, box = display.sizer.getBoundingClientRect(), doScroll = null;
    if (coords.top + box.top < 0) doScroll = true;
    else if (coords.bottom + box.top > (window.innerHeight || document.documentElement.clientHeight)) doScroll = false;
    if (doScroll != null && !phantom) {
      var scrollNode = elt("div", "\u200b", null, "position: absolute; top: " +
                           (coords.top - display.viewOffset - paddingTop(cm.display)) + "px; height: " +
                           (coords.bottom - coords.top + scrollGap(cm) + display.barHeight) + "px; left: " +
                           coords.left + "px; width: 2px;");
      cm.display.lineSpace.appendChild(scrollNode);
      scrollNode.scrollIntoView(doScroll);
      cm.display.lineSpace.removeChild(scrollNode);
    }
  }

  // Scroll a given position into view (immediately), verifying that
  // it actually became visible (as line heights are accurately
  // measured, the position of something may 'drift' during drawing).
  function scrollPosIntoView(cm, pos, end, margin) {
    if (margin == null) margin = 0;
    for (var limit = 0; limit < 5; limit++) {
      var changed = false, coords = cursorCoords(cm, pos);
      var endCoords = !end || end == pos ? coords : cursorCoords(cm, end);
      var scrollPos = calculateScrollPos(cm, Math.min(coords.left, endCoords.left),
                                         Math.min(coords.top, endCoords.top) - margin,
                                         Math.max(coords.left, endCoords.left),
                                         Math.max(coords.bottom, endCoords.bottom) + margin);
      var startTop = cm.doc.scrollTop, startLeft = cm.doc.scrollLeft;
      if (scrollPos.scrollTop != null) {
        setScrollTop(cm, scrollPos.scrollTop);
        if (Math.abs(cm.doc.scrollTop - startTop) > 1) changed = true;
      }
      if (scrollPos.scrollLeft != null) {
        setScrollLeft(cm, scrollPos.scrollLeft);
        if (Math.abs(cm.doc.scrollLeft - startLeft) > 1) changed = true;
      }
      if (!changed) break;
    }
    return coords;
  }

  // Scroll a given set of coordinates into view (immediately).
  function scrollIntoView(cm, x1, y1, x2, y2) {
    var scrollPos = calculateScrollPos(cm, x1, y1, x2, y2);
    if (scrollPos.scrollTop != null) setScrollTop(cm, scrollPos.scrollTop);
    if (scrollPos.scrollLeft != null) setScrollLeft(cm, scrollPos.scrollLeft);
  }

  // Calculate a new scroll position needed to scroll the given
  // rectangle into view. Returns an object with scrollTop and
  // scrollLeft properties. When these are undefined, the
  // vertical/horizontal position does not need to be adjusted.
  function calculateScrollPos(cm, x1, y1, x2, y2) {
    var display = cm.display, snapMargin = textHeight(cm.display);
    if (y1 < 0) y1 = 0;
    var screentop = cm.curOp && cm.curOp.scrollTop != null ? cm.curOp.scrollTop : display.scroller.scrollTop;
    var screen = displayHeight(cm), result = {};
    if (y2 - y1 > screen) y2 = y1 + screen;
    var docBottom = cm.doc.height + paddingVert(display);
    var atTop = y1 < snapMargin, atBottom = y2 > docBottom - snapMargin;
    if (y1 < screentop) {
      result.scrollTop = atTop ? 0 : y1;
    } else if (y2 > screentop + screen) {
      var newTop = Math.min(y1, (atBottom ? docBottom : y2) - screen);
      if (newTop != screentop) result.scrollTop = newTop;
    }

    var screenleft = cm.curOp && cm.curOp.scrollLeft != null ? cm.curOp.scrollLeft : display.scroller.scrollLeft;
    var screenw = displayWidth(cm) - (cm.options.fixedGutter ? display.gutters.offsetWidth : 0);
    var tooWide = x2 - x1 > screenw;
    if (tooWide) x2 = x1 + screenw;
    if (x1 < 10)
      result.scrollLeft = 0;
    else if (x1 < screenleft)
      result.scrollLeft = Math.max(0, x1 - (tooWide ? 0 : 10));
    else if (x2 > screenw + screenleft - 3)
      result.scrollLeft = x2 + (tooWide ? 0 : 10) - screenw;
    return result;
  }

  // Store a relative adjustment to the scroll position in the current
  // operation (to be applied when the operation finishes).
  function addToScrollPos(cm, left, top) {
    if (left != null || top != null) resolveScrollToPos(cm);
    if (left != null)
      cm.curOp.scrollLeft = (cm.curOp.scrollLeft == null ? cm.doc.scrollLeft : cm.curOp.scrollLeft) + left;
    if (top != null)
      cm.curOp.scrollTop = (cm.curOp.scrollTop == null ? cm.doc.scrollTop : cm.curOp.scrollTop) + top;
  }

  // Make sure that at the end of the operation the current cursor is
  // shown.
  function ensureCursorVisible(cm) {
    resolveScrollToPos(cm);
    var cur = cm.getCursor(), from = cur, to = cur;
    if (!cm.options.lineWrapping) {
      from = cur.ch ? Pos(cur.line, cur.ch - 1) : cur;
      to = Pos(cur.line, cur.ch + 1);
    }
    cm.curOp.scrollToPos = {from: from, to: to, margin: cm.options.cursorScrollMargin, isCursor: true};
  }

  // When an operation has its scrollToPos property set, and another
  // scroll action is applied before the end of the operation, this
  // 'simulates' scrolling that position into view in a cheap way, so
  // that the effect of intermediate scroll commands is not ignored.
  function resolveScrollToPos(cm) {
    var range = cm.curOp.scrollToPos;
    if (range) {
      cm.curOp.scrollToPos = null;
      var from = estimateCoords(cm, range.from), to = estimateCoords(cm, range.to);
      var sPos = calculateScrollPos(cm, Math.min(from.left, to.left),
                                    Math.min(from.top, to.top) - range.margin,
                                    Math.max(from.right, to.right),
                                    Math.max(from.bottom, to.bottom) + range.margin);
      cm.scrollTo(sPos.scrollLeft, sPos.scrollTop);
    }
  }

  // API UTILITIES

  // Indent the given line. The how parameter can be "smart",
  // "add"/null, "subtract", or "prev". When aggressive is false
  // (typically set to true for forced single-line indents), empty
  // lines are not indented, and places where the mode returns Pass
  // are left alone.
  function indentLine(cm, n, how, aggressive) {
    var doc = cm.doc, state;
    if (how == null) how = "add";
    if (how == "smart") {
      // Fall back to "prev" when the mode doesn't have an indentation
      // method.
      if (!doc.mode.indent) how = "prev";
      else state = getStateBefore(cm, n);
    }

    var tabSize = cm.options.tabSize;
    var line = getLine(doc, n), curSpace = countColumn(line.text, null, tabSize);
    if (line.stateAfter) line.stateAfter = null;
    var curSpaceString = line.text.match(/^\s*/)[0], indentation;
    if (!aggressive && !/\S/.test(line.text)) {
      indentation = 0;
      how = "not";
    } else if (how == "smart") {
      indentation = doc.mode.indent(state, line.text.slice(curSpaceString.length), line.text);
      if (indentation == Pass || indentation > 150) {
        if (!aggressive) return;
        how = "prev";
      }
    }
    if (how == "prev") {
      if (n > doc.first) indentation = countColumn(getLine(doc, n-1).text, null, tabSize);
      else indentation = 0;
    } else if (how == "add") {
      indentation = curSpace + cm.options.indentUnit;
    } else if (how == "subtract") {
      indentation = curSpace - cm.options.indentUnit;
    } else if (typeof how == "number") {
      indentation = curSpace + how;
    }
    indentation = Math.max(0, indentation);

    var indentString = "", pos = 0;
    if (cm.options.indentWithTabs)
      for (var i = Math.floor(indentation / tabSize); i; --i) {pos += tabSize; indentString += "\t";}
    if (pos < indentation) indentString += spaceStr(indentation - pos);

    if (indentString != curSpaceString) {
      replaceRange(doc, indentString, Pos(n, 0), Pos(n, curSpaceString.length), "+input");
      line.stateAfter = null;
      return true;
    } else {
      // Ensure that, if the cursor was in the whitespace at the start
      // of the line, it is moved to the end of that space.
      for (var i = 0; i < doc.sel.ranges.length; i++) {
        var range = doc.sel.ranges[i];
        if (range.head.line == n && range.head.ch < curSpaceString.length) {
          var pos = Pos(n, curSpaceString.length);
          replaceOneSelection(doc, i, new Range(pos, pos));
          break;
        }
      }
    }
  }

  // Utility for applying a change to a line by handle or number,
  // returning the number and optionally registering the line as
  // changed.
  function changeLine(doc, handle, changeType, op) {
    var no = handle, line = handle;
    if (typeof handle == "number") line = getLine(doc, clipLine(doc, handle));
    else no = lineNo(handle);
    if (no == null) return null;
    if (op(line, no) && doc.cm) regLineChange(doc.cm, no, changeType);
    return line;
  }

  // Helper for deleting text near the selection(s), used to implement
  // backspace, delete, and similar functionality.
  function deleteNearSelection(cm, compute) {
    var ranges = cm.doc.sel.ranges, kill = [];
    // Build up a set of ranges to kill first, merging overlapping
    // ranges.
    for (var i = 0; i < ranges.length; i++) {
      var toKill = compute(ranges[i]);
      while (kill.length && cmp(toKill.from, lst(kill).to) <= 0) {
        var replaced = kill.pop();
        if (cmp(replaced.from, toKill.from) < 0) {
          toKill.from = replaced.from;
          break;
        }
      }
      kill.push(toKill);
    }
    // Next, remove those actual ranges.
    runInOp(cm, function() {
      for (var i = kill.length - 1; i >= 0; i--)
        replaceRange(cm.doc, "", kill[i].from, kill[i].to, "+delete");
      ensureCursorVisible(cm);
    });
  }

  // Used for horizontal relative motion. Dir is -1 or 1 (left or
  // right), unit can be "char", "column" (like char, but doesn't
  // cross line boundaries), "word" (across next word), or "group" (to
  // the start of next group of word or non-word-non-whitespace
  // chars). The visually param controls whether, in right-to-left
  // text, direction 1 means to move towards the next index in the
  // string, or towards the character to the right of the current
  // position. The resulting position will have a hitSide=true
  // property if it reached the end of the document.
  function findPosH(doc, pos, dir, unit, visually) {
    var line = pos.line, ch = pos.ch, origDir = dir;
    var lineObj = getLine(doc, line);
    var possible = true;
    function findNextLine() {
      var l = line + dir;
      if (l < doc.first || l >= doc.first + doc.size) return (possible = false);
      line = l;
      return lineObj = getLine(doc, l);
    }
    function moveOnce(boundToLine) {
      var next = (visually ? moveVisually : moveLogically)(lineObj, ch, dir, true);
      if (next == null) {
        if (!boundToLine && findNextLine()) {
          if (visually) ch = (dir < 0 ? lineRight : lineLeft)(lineObj);
          else ch = dir < 0 ? lineObj.text.length : 0;
        } else return (possible = false);
      } else ch = next;
      return true;
    }

    if (unit == "char") moveOnce();
    else if (unit == "column") moveOnce(true);
    else if (unit == "word" || unit == "group") {
      var sawType = null, group = unit == "group";
      var helper = doc.cm && doc.cm.getHelper(pos, "wordChars");
      for (var first = true;; first = false) {
        if (dir < 0 && !moveOnce(!first)) break;
        var cur = lineObj.text.charAt(ch) || "\n";
        var type = isWordChar(cur, helper) ? "w"
          : group && cur == "\n" ? "n"
          : !group || /\s/.test(cur) ? null
          : "p";
        if (group && !first && !type) type = "s";
        if (sawType && sawType != type) {
          if (dir < 0) {dir = 1; moveOnce();}
          break;
        }

        if (type) sawType = type;
        if (dir > 0 && !moveOnce(!first)) break;
      }
    }
    var result = skipAtomic(doc, Pos(line, ch), origDir, true);
    if (!possible) result.hitSide = true;
    return result;
  }

  // For relative vertical movement. Dir may be -1 or 1. Unit can be
  // "page" or "line". The resulting position will have a hitSide=true
  // property if it reached the end of the document.
  function findPosV(cm, pos, dir, unit) {
    var doc = cm.doc, x = pos.left, y;
    if (unit == "page") {
      var pageSize = Math.min(cm.display.wrapper.clientHeight, window.innerHeight || document.documentElement.clientHeight);
      y = pos.top + dir * (pageSize - (dir < 0 ? 1.5 : .5) * textHeight(cm.display));
    } else if (unit == "line") {
      y = dir > 0 ? pos.bottom + 3 : pos.top - 3;
    }
    for (;;) {
      var target = coordsChar(cm, x, y);
      if (!target.outside) break;
      if (dir < 0 ? y <= 0 : y >= doc.height) { target.hitSide = true; break; }
      y += dir * 5;
    }
    return target;
  }

  // EDITOR METHODS

  // The publicly visible API. Note that methodOp(f) means
  // 'wrap f in an operation, performed on its `this` parameter'.

  // This is not the complete set of editor methods. Most of the
  // methods defined on the Doc type are also injected into
  // CodeMirror.prototype, for backwards compatibility and
  // convenience.

  CodeMirror.prototype = {
    constructor: CodeMirror,
    focus: function(){window.focus(); this.display.input.focus();},

    setOption: function(option, value) {
      var options = this.options, old = options[option];
      if (options[option] == value && option != "mode") return;
      options[option] = value;
      if (optionHandlers.hasOwnProperty(option))
        operation(this, optionHandlers[option])(this, value, old);
    },

    getOption: function(option) {return this.options[option];},
    getDoc: function() {return this.doc;},

    addKeyMap: function(map, bottom) {
      this.state.keyMaps[bottom ? "push" : "unshift"](getKeyMap(map));
    },
    removeKeyMap: function(map) {
      var maps = this.state.keyMaps;
      for (var i = 0; i < maps.length; ++i)
        if (maps[i] == map || maps[i].name == map) {
          maps.splice(i, 1);
          return true;
        }
    },

    addOverlay: methodOp(function(spec, options) {
      var mode = spec.token ? spec : CodeMirror.getMode(this.options, spec);
      if (mode.startState) throw new Error("Overlays may not be stateful.");
      this.state.overlays.push({mode: mode, modeSpec: spec, opaque: options && options.opaque});
      this.state.modeGen++;
      regChange(this);
    }),
    removeOverlay: methodOp(function(spec) {
      var overlays = this.state.overlays;
      for (var i = 0; i < overlays.length; ++i) {
        var cur = overlays[i].modeSpec;
        if (cur == spec || typeof spec == "string" && cur.name == spec) {
          overlays.splice(i, 1);
          this.state.modeGen++;
          regChange(this);
          return;
        }
      }
    }),

    indentLine: methodOp(function(n, dir, aggressive) {
      if (typeof dir != "string" && typeof dir != "number") {
        if (dir == null) dir = this.options.smartIndent ? "smart" : "prev";
        else dir = dir ? "add" : "subtract";
      }
      if (isLine(this.doc, n)) indentLine(this, n, dir, aggressive);
    }),
    indentSelection: methodOp(function(how) {
      var ranges = this.doc.sel.ranges, end = -1;
      for (var i = 0; i < ranges.length; i++) {
        var range = ranges[i];
        if (!range.empty()) {
          var from = range.from(), to = range.to();
          var start = Math.max(end, from.line);
          end = Math.min(this.lastLine(), to.line - (to.ch ? 0 : 1)) + 1;
          for (var j = start; j < end; ++j)
            indentLine(this, j, how);
          var newRanges = this.doc.sel.ranges;
          if (from.ch == 0 && ranges.length == newRanges.length && newRanges[i].from().ch > 0)
            replaceOneSelection(this.doc, i, new Range(from, newRanges[i].to()), sel_dontScroll);
        } else if (range.head.line > end) {
          indentLine(this, range.head.line, how, true);
          end = range.head.line;
          if (i == this.doc.sel.primIndex) ensureCursorVisible(this);
        }
      }
    }),

    // Fetch the parser token for a given character. Useful for hacks
    // that want to inspect the mode state (say, for completion).
    getTokenAt: function(pos, precise) {
      return takeToken(this, pos, precise);
    },

    getLineTokens: function(line, precise) {
      return takeToken(this, Pos(line), precise, true);
    },

    getTokenTypeAt: function(pos) {
      pos = clipPos(this.doc, pos);
      var styles = getLineStyles(this, getLine(this.doc, pos.line));
      var before = 0, after = (styles.length - 1) / 2, ch = pos.ch;
      var type;
      if (ch == 0) type = styles[2];
      else for (;;) {
        var mid = (before + after) >> 1;
        if ((mid ? styles[mid * 2 - 1] : 0) >= ch) after = mid;
        else if (styles[mid * 2 + 1] < ch) before = mid + 1;
        else { type = styles[mid * 2 + 2]; break; }
      }
      var cut = type ? type.indexOf("cm-overlay ") : -1;
      return cut < 0 ? type : cut == 0 ? null : type.slice(0, cut - 1);
    },

    getModeAt: function(pos) {
      var mode = this.doc.mode;
      if (!mode.innerMode) return mode;
      return CodeMirror.innerMode(mode, this.getTokenAt(pos).state).mode;
    },

    getHelper: function(pos, type) {
      return this.getHelpers(pos, type)[0];
    },

    getHelpers: function(pos, type) {
      var found = [];
      if (!helpers.hasOwnProperty(type)) return found;
      var help = helpers[type], mode = this.getModeAt(pos);
      if (typeof mode[type] == "string") {
        if (help[mode[type]]) found.push(help[mode[type]]);
      } else if (mode[type]) {
        for (var i = 0; i < mode[type].length; i++) {
          var val = help[mode[type][i]];
          if (val) found.push(val);
        }
      } else if (mode.helperType && help[mode.helperType]) {
        found.push(help[mode.helperType]);
      } else if (help[mode.name]) {
        found.push(help[mode.name]);
      }
      for (var i = 0; i < help._global.length; i++) {
        var cur = help._global[i];
        if (cur.pred(mode, this) && indexOf(found, cur.val) == -1)
          found.push(cur.val);
      }
      return found;
    },

    getStateAfter: function(line, precise) {
      var doc = this.doc;
      line = clipLine(doc, line == null ? doc.first + doc.size - 1: line);
      return getStateBefore(this, line + 1, precise);
    },

    cursorCoords: function(start, mode) {
      var pos, range = this.doc.sel.primary();
      if (start == null) pos = range.head;
      else if (typeof start == "object") pos = clipPos(this.doc, start);
      else pos = start ? range.from() : range.to();
      return cursorCoords(this, pos, mode || "page");
    },

    charCoords: function(pos, mode) {
      return charCoords(this, clipPos(this.doc, pos), mode || "page");
    },

    coordsChar: function(coords, mode) {
      coords = fromCoordSystem(this, coords, mode || "page");
      return coordsChar(this, coords.left, coords.top);
    },

    lineAtHeight: function(height, mode) {
      height = fromCoordSystem(this, {top: height, left: 0}, mode || "page").top;
      return lineAtHeight(this.doc, height + this.display.viewOffset);
    },
    heightAtLine: function(line, mode) {
      var end = false, lineObj;
      if (typeof line == "number") {
        var last = this.doc.first + this.doc.size - 1;
        if (line < this.doc.first) line = this.doc.first;
        else if (line > last) { line = last; end = true; }
        lineObj = getLine(this.doc, line);
      } else {
        lineObj = line;
      }
      return intoCoordSystem(this, lineObj, {top: 0, left: 0}, mode || "page").top +
        (end ? this.doc.height - heightAtLine(lineObj) : 0);
    },

    defaultTextHeight: function() { return textHeight(this.display); },
    defaultCharWidth: function() { return charWidth(this.display); },

    setGutterMarker: methodOp(function(line, gutterID, value) {
      return changeLine(this.doc, line, "gutter", function(line) {
        var markers = line.gutterMarkers || (line.gutterMarkers = {});
        markers[gutterID] = value;
        if (!value && isEmpty(markers)) line.gutterMarkers = null;
        return true;
      });
    }),

    clearGutter: methodOp(function(gutterID) {
      var cm = this, doc = cm.doc, i = doc.first;
      doc.iter(function(line) {
        if (line.gutterMarkers && line.gutterMarkers[gutterID]) {
          line.gutterMarkers[gutterID] = null;
          regLineChange(cm, i, "gutter");
          if (isEmpty(line.gutterMarkers)) line.gutterMarkers = null;
        }
        ++i;
      });
    }),

    lineInfo: function(line) {
      if (typeof line == "number") {
        if (!isLine(this.doc, line)) return null;
        var n = line;
        line = getLine(this.doc, line);
        if (!line) return null;
      } else {
        var n = lineNo(line);
        if (n == null) return null;
      }
      return {line: n, handle: line, text: line.text, gutterMarkers: line.gutterMarkers,
              textClass: line.textClass, bgClass: line.bgClass, wrapClass: line.wrapClass,
              widgets: line.widgets};
    },

    getViewport: function() { return {from: this.display.viewFrom, to: this.display.viewTo};},

    addWidget: function(pos, node, scroll, vert, horiz) {
      var display = this.display;
      pos = cursorCoords(this, clipPos(this.doc, pos));
      var top = pos.bottom, left = pos.left;
      node.style.position = "absolute";
      node.setAttribute("cm-ignore-events", "true");
      this.display.input.setUneditable(node);
      display.sizer.appendChild(node);
      if (vert == "over") {
        top = pos.top;
      } else if (vert == "above" || vert == "near") {
        var vspace = Math.max(display.wrapper.clientHeight, this.doc.height),
        hspace = Math.max(display.sizer.clientWidth, display.lineSpace.clientWidth);
        // Default to positioning above (if specified and possible); otherwise default to positioning below
        if ((vert == 'above' || pos.bottom + node.offsetHeight > vspace) && pos.top > node.offsetHeight)
          top = pos.top - node.offsetHeight;
        else if (pos.bottom + node.offsetHeight <= vspace)
          top = pos.bottom;
        if (left + node.offsetWidth > hspace)
          left = hspace - node.offsetWidth;
      }
      node.style.top = top + "px";
      node.style.left = node.style.right = "";
      if (horiz == "right") {
        left = display.sizer.clientWidth - node.offsetWidth;
        node.style.right = "0px";
      } else {
        if (horiz == "left") left = 0;
        else if (horiz == "middle") left = (display.sizer.clientWidth - node.offsetWidth) / 2;
        node.style.left = left + "px";
      }
      if (scroll)
        scrollIntoView(this, left, top, left + node.offsetWidth, top + node.offsetHeight);
    },

    triggerOnKeyDown: methodOp(onKeyDown),
    triggerOnKeyPress: methodOp(onKeyPress),
    triggerOnKeyUp: onKeyUp,

    execCommand: function(cmd) {
      if (commands.hasOwnProperty(cmd))
        return commands[cmd].call(null, this);
    },

    triggerElectric: methodOp(function(text) { triggerElectric(this, text); }),

    findPosH: function(from, amount, unit, visually) {
      var dir = 1;
      if (amount < 0) { dir = -1; amount = -amount; }
      for (var i = 0, cur = clipPos(this.doc, from); i < amount; ++i) {
        cur = findPosH(this.doc, cur, dir, unit, visually);
        if (cur.hitSide) break;
      }
      return cur;
    },

    moveH: methodOp(function(dir, unit) {
      var cm = this;
      cm.extendSelectionsBy(function(range) {
        if (cm.display.shift || cm.doc.extend || range.empty())
          return findPosH(cm.doc, range.head, dir, unit, cm.options.rtlMoveVisually);
        else
          return dir < 0 ? range.from() : range.to();
      }, sel_move);
    }),

    deleteH: methodOp(function(dir, unit) {
      var sel = this.doc.sel, doc = this.doc;
      if (sel.somethingSelected())
        doc.replaceSelection("", null, "+delete");
      else
        deleteNearSelection(this, function(range) {
          var other = findPosH(doc, range.head, dir, unit, false);
          return dir < 0 ? {from: other, to: range.head} : {from: range.head, to: other};
        });
    }),

    findPosV: function(from, amount, unit, goalColumn) {
      var dir = 1, x = goalColumn;
      if (amount < 0) { dir = -1; amount = -amount; }
      for (var i = 0, cur = clipPos(this.doc, from); i < amount; ++i) {
        var coords = cursorCoords(this, cur, "div");
        if (x == null) x = coords.left;
        else coords.left = x;
        cur = findPosV(this, coords, dir, unit);
        if (cur.hitSide) break;
      }
      return cur;
    },

    moveV: methodOp(function(dir, unit) {
      var cm = this, doc = this.doc, goals = [];
      var collapse = !cm.display.shift && !doc.extend && doc.sel.somethingSelected();
      doc.extendSelectionsBy(function(range) {
        if (collapse)
          return dir < 0 ? range.from() : range.to();
        var headPos = cursorCoords(cm, range.head, "div");
        if (range.goalColumn != null) headPos.left = range.goalColumn;
        goals.push(headPos.left);
        var pos = findPosV(cm, headPos, dir, unit);
        if (unit == "page" && range == doc.sel.primary())
          addToScrollPos(cm, null, charCoords(cm, pos, "div").top - headPos.top);
        return pos;
      }, sel_move);
      if (goals.length) for (var i = 0; i < doc.sel.ranges.length; i++)
        doc.sel.ranges[i].goalColumn = goals[i];
    }),

    // Find the word at the given position (as returned by coordsChar).
    findWordAt: function(pos) {
      var doc = this.doc, line = getLine(doc, pos.line).text;
      var start = pos.ch, end = pos.ch;
      if (line) {
        var helper = this.getHelper(pos, "wordChars");
        if ((pos.xRel < 0 || end == line.length) && start) --start; else ++end;
        var startChar = line.charAt(start);
        var check = isWordChar(startChar, helper)
          ? function(ch) { return isWordChar(ch, helper); }
          : /\s/.test(startChar) ? function(ch) {return /\s/.test(ch);}
          : function(ch) {return !/\s/.test(ch) && !isWordChar(ch);};
        while (start > 0 && check(line.charAt(start - 1))) --start;
        while (end < line.length && check(line.charAt(end))) ++end;
      }
      return new Range(Pos(pos.line, start), Pos(pos.line, end));
    },

    toggleOverwrite: function(value) {
      if (value != null && value == this.state.overwrite) return;
      if (this.state.overwrite = !this.state.overwrite)
        addClass(this.display.cursorDiv, "CodeMirror-overwrite");
      else
        rmClass(this.display.cursorDiv, "CodeMirror-overwrite");

      signal(this, "overwriteToggle", this, this.state.overwrite);
    },
    hasFocus: function() { return this.display.input.getField() == activeElt(); },

    scrollTo: methodOp(function(x, y) {
      if (x != null || y != null) resolveScrollToPos(this);
      if (x != null) this.curOp.scrollLeft = x;
      if (y != null) this.curOp.scrollTop = y;
    }),
    getScrollInfo: function() {
      var scroller = this.display.scroller;
      return {left: scroller.scrollLeft, top: scroller.scrollTop,
              height: scroller.scrollHeight - scrollGap(this) - this.display.barHeight,
              width: scroller.scrollWidth - scrollGap(this) - this.display.barWidth,
              clientHeight: displayHeight(this), clientWidth: displayWidth(this)};
    },

    scrollIntoView: methodOp(function(range, margin) {
      if (range == null) {
        range = {from: this.doc.sel.primary().head, to: null};
        if (margin == null) margin = this.options.cursorScrollMargin;
      } else if (typeof range == "number") {
        range = {from: Pos(range, 0), to: null};
      } else if (range.from == null) {
        range = {from: range, to: null};
      }
      if (!range.to) range.to = range.from;
      range.margin = margin || 0;

      if (range.from.line != null) {
        resolveScrollToPos(this);
        this.curOp.scrollToPos = range;
      } else {
        var sPos = calculateScrollPos(this, Math.min(range.from.left, range.to.left),
                                      Math.min(range.from.top, range.to.top) - range.margin,
                                      Math.max(range.from.right, range.to.right),
                                      Math.max(range.from.bottom, range.to.bottom) + range.margin);
        this.scrollTo(sPos.scrollLeft, sPos.scrollTop);
      }
    }),

    setSize: methodOp(function(width, height) {
      var cm = this;
      function interpret(val) {
        return typeof val == "number" || /^\d+$/.test(String(val)) ? val + "px" : val;
      }
      if (width != null) cm.display.wrapper.style.width = interpret(width);
      if (height != null) cm.display.wrapper.style.height = interpret(height);
      if (cm.options.lineWrapping) clearLineMeasurementCache(this);
      var lineNo = cm.display.viewFrom;
      cm.doc.iter(lineNo, cm.display.viewTo, function(line) {
        if (line.widgets) for (var i = 0; i < line.widgets.length; i++)
          if (line.widgets[i].noHScroll) { regLineChange(cm, lineNo, "widget"); break; }
        ++lineNo;
      });
      cm.curOp.forceUpdate = true;
      signal(cm, "refresh", this);
    }),

    operation: function(f){return runInOp(this, f);},

    refresh: methodOp(function() {
      var oldHeight = this.display.cachedTextHeight;
      regChange(this);
      this.curOp.forceUpdate = true;
      clearCaches(this);
      this.scrollTo(this.doc.scrollLeft, this.doc.scrollTop);
      updateGutterSpace(this);
      if (oldHeight == null || Math.abs(oldHeight - textHeight(this.display)) > .5)
        estimateLineHeights(this);
      signal(this, "refresh", this);
    }),

    swapDoc: methodOp(function(doc) {
      var old = this.doc;
      old.cm = null;
      attachDoc(this, doc);
      clearCaches(this);
      this.display.input.reset();
      this.scrollTo(doc.scrollLeft, doc.scrollTop);
      this.curOp.forceScroll = true;
      signalLater(this, "swapDoc", this, old);
      return old;
    }),

    getInputField: function(){return this.display.input.getField();},
    getWrapperElement: function(){return this.display.wrapper;},
    getScrollerElement: function(){return this.display.scroller;},
    getGutterElement: function(){return this.display.gutters;}
  };
  eventMixin(CodeMirror);

  // OPTION DEFAULTS

  // The default configuration options.
  var defaults = CodeMirror.defaults = {};
  // Functions to run when options are changed.
  var optionHandlers = CodeMirror.optionHandlers = {};

  function option(name, deflt, handle, notOnInit) {
    CodeMirror.defaults[name] = deflt;
    if (handle) optionHandlers[name] =
      notOnInit ? function(cm, val, old) {if (old != Init) handle(cm, val, old);} : handle;
  }

  // Passed to option handlers when there is no old value.
  var Init = CodeMirror.Init = {toString: function(){return "CodeMirror.Init";}};

  // These two are, on init, called from the constructor because they
  // have to be initialized before the editor can start at all.
  option("value", "", function(cm, val) {
    cm.setValue(val);
  }, true);
  option("mode", null, function(cm, val) {
    cm.doc.modeOption = val;
    loadMode(cm);
  }, true);

  option("indentUnit", 2, loadMode, true);
  option("indentWithTabs", false);
  option("smartIndent", true);
  option("tabSize", 4, function(cm) {
    resetModeState(cm);
    clearCaches(cm);
    regChange(cm);
  }, true);
  option("lineSeparator", null, function(cm, val) {
    cm.doc.lineSep = val;
    if (!val) return;
    var newBreaks = [], lineNo = cm.doc.first;
    cm.doc.iter(function(line) {
      for (var pos = 0;;) {
        var found = line.text.indexOf(val, pos);
        if (found == -1) break;
        pos = found + val.length;
        newBreaks.push(Pos(lineNo, found));
      }
      lineNo++;
    });
    for (var i = newBreaks.length - 1; i >= 0; i--)
      replaceRange(cm.doc, val, newBreaks[i], Pos(newBreaks[i].line, newBreaks[i].ch + val.length))
  });
  option("specialChars", /[\t\u0000-\u0019\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, function(cm, val, old) {
    cm.state.specialChars = new RegExp(val.source + (val.test("\t") ? "" : "|\t"), "g");
    if (old != CodeMirror.Init) cm.refresh();
  });
  option("specialCharPlaceholder", defaultSpecialCharPlaceholder, function(cm) {cm.refresh();}, true);
  option("electricChars", true);
  option("inputStyle", mobile ? "contenteditable" : "textarea", function() {
    throw new Error("inputStyle can not (yet) be changed in a running editor"); // FIXME
  }, true);
  option("rtlMoveVisually", !windows);
  option("wholeLineUpdateBefore", true);

  option("theme", "default", function(cm) {
    themeChanged(cm);
    guttersChanged(cm);
  }, true);
  option("keyMap", "default", function(cm, val, old) {
    var next = getKeyMap(val);
    var prev = old != CodeMirror.Init && getKeyMap(old);
    if (prev && prev.detach) prev.detach(cm, next);
    if (next.attach) next.attach(cm, prev || null);
  });
  option("extraKeys", null);

  option("lineWrapping", false, wrappingChanged, true);
  option("gutters", [], function(cm) {
    setGuttersForLineNumbers(cm.options);
    guttersChanged(cm);
  }, true);
  option("fixedGutter", true, function(cm, val) {
    cm.display.gutters.style.left = val ? compensateForHScroll(cm.display) + "px" : "0";
    cm.refresh();
  }, true);
  option("coverGutterNextToScrollbar", false, function(cm) {updateScrollbars(cm);}, true);
  option("scrollbarStyle", "native", function(cm) {
    initScrollbars(cm);
    updateScrollbars(cm);
    cm.display.scrollbars.setScrollTop(cm.doc.scrollTop);
    cm.display.scrollbars.setScrollLeft(cm.doc.scrollLeft);
  }, true);
  option("lineNumbers", false, function(cm) {
    setGuttersForLineNumbers(cm.options);
    guttersChanged(cm);
  }, true);
  option("firstLineNumber", 1, guttersChanged, true);
  option("lineNumberFormatter", function(integer) {return integer;}, guttersChanged, true);
  option("showCursorWhenSelecting", false, updateSelection, true);

  option("resetSelectionOnContextMenu", true);
  option("lineWiseCopyCut", true);

  option("readOnly", false, function(cm, val) {
    if (val == "nocursor") {
      onBlur(cm);
      cm.display.input.blur();
      cm.display.disabled = true;
    } else {
      cm.display.disabled = false;
    }
    cm.display.input.readOnlyChanged(val)
  });
  option("disableInput", false, function(cm, val) {if (!val) cm.display.input.reset();}, true);
  option("dragDrop", true, dragDropChanged);
  option("allowDropFileTypes", null);

  option("cursorBlinkRate", 530);
  option("cursorScrollMargin", 0);
  option("cursorHeight", 1, updateSelection, true);
  option("singleCursorHeightPerLine", true, updateSelection, true);
  option("workTime", 100);
  option("workDelay", 100);
  option("flattenSpans", true, resetModeState, true);
  option("addModeClass", false, resetModeState, true);
  option("pollInterval", 100);
  option("undoDepth", 200, function(cm, val){cm.doc.history.undoDepth = val;});
  option("historyEventDelay", 1250);
  option("viewportMargin", 10, function(cm){cm.refresh();}, true);
  option("maxHighlightLength", 10000, resetModeState, true);
  option("moveInputWithCursor", true, function(cm, val) {
    if (!val) cm.display.input.resetPosition();
  });

  option("tabindex", null, function(cm, val) {
    cm.display.input.getField().tabIndex = val || "";
  });
  option("autofocus", null);

  // MODE DEFINITION AND QUERYING

  // Known modes, by name and by MIME
  var modes = CodeMirror.modes = {}, mimeModes = CodeMirror.mimeModes = {};

  // Extra arguments are stored as the mode's dependencies, which is
  // used by (legacy) mechanisms like loadmode.js to automatically
  // load a mode. (Preferred mechanism is the require/define calls.)
  CodeMirror.defineMode = function(name, mode) {
    if (!CodeMirror.defaults.mode && name != "null") CodeMirror.defaults.mode = name;
    if (arguments.length > 2)
      mode.dependencies = Array.prototype.slice.call(arguments, 2);
    modes[name] = mode;
  };

  CodeMirror.defineMIME = function(mime, spec) {
    mimeModes[mime] = spec;
  };

  // Given a MIME type, a {name, ...options} config object, or a name
  // string, return a mode config object.
  CodeMirror.resolveMode = function(spec) {
    if (typeof spec == "string" && mimeModes.hasOwnProperty(spec)) {
      spec = mimeModes[spec];
    } else if (spec && typeof spec.name == "string" && mimeModes.hasOwnProperty(spec.name)) {
      var found = mimeModes[spec.name];
      if (typeof found == "string") found = {name: found};
      spec = createObj(found, spec);
      spec.name = found.name;
    } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+xml$/.test(spec)) {
      return CodeMirror.resolveMode("application/xml");
    }
    if (typeof spec == "string") return {name: spec};
    else return spec || {name: "null"};
  };

  // Given a mode spec (anything that resolveMode accepts), find and
  // initialize an actual mode object.
  CodeMirror.getMode = function(options, spec) {
    var spec = CodeMirror.resolveMode(spec);
    var mfactory = modes[spec.name];
    if (!mfactory) return CodeMirror.getMode(options, "text/plain");
    var modeObj = mfactory(options, spec);
    if (modeExtensions.hasOwnProperty(spec.name)) {
      var exts = modeExtensions[spec.name];
      for (var prop in exts) {
        if (!exts.hasOwnProperty(prop)) continue;
        if (modeObj.hasOwnProperty(prop)) modeObj["_" + prop] = modeObj[prop];
        modeObj[prop] = exts[prop];
      }
    }
    modeObj.name = spec.name;
    if (spec.helperType) modeObj.helperType = spec.helperType;
    if (spec.modeProps) for (var prop in spec.modeProps)
      modeObj[prop] = spec.modeProps[prop];

    return modeObj;
  };

  // Minimal default mode.
  CodeMirror.defineMode("null", function() {
    return {token: function(stream) {stream.skipToEnd();}};
  });
  CodeMirror.defineMIME("text/plain", "null");

  // This can be used to attach properties to mode objects from
  // outside the actual mode definition.
  var modeExtensions = CodeMirror.modeExtensions = {};
  CodeMirror.extendMode = function(mode, properties) {
    var exts = modeExtensions.hasOwnProperty(mode) ? modeExtensions[mode] : (modeExtensions[mode] = {});
    copyObj(properties, exts);
  };

  // EXTENSIONS

  CodeMirror.defineExtension = function(name, func) {
    CodeMirror.prototype[name] = func;
  };
  CodeMirror.defineDocExtension = function(name, func) {
    Doc.prototype[name] = func;
  };
  CodeMirror.defineOption = option;

  var initHooks = [];
  CodeMirror.defineInitHook = function(f) {initHooks.push(f);};

  var helpers = CodeMirror.helpers = {};
  CodeMirror.registerHelper = function(type, name, value) {
    if (!helpers.hasOwnProperty(type)) helpers[type] = CodeMirror[type] = {_global: []};
    helpers[type][name] = value;
  };
  CodeMirror.registerGlobalHelper = function(type, name, predicate, value) {
    CodeMirror.registerHelper(type, name, value);
    helpers[type]._global.push({pred: predicate, val: value});
  };

  // MODE STATE HANDLING

  // Utility functions for working with state. Exported because nested
  // modes need to do this for their inner modes.

  var copyState = CodeMirror.copyState = function(mode, state) {
    if (state === true) return state;
    if (mode.copyState) return mode.copyState(state);
    var nstate = {};
    for (var n in state) {
      var val = state[n];
      if (val instanceof Array) val = val.concat([]);
      nstate[n] = val;
    }
    return nstate;
  };

  var startState = CodeMirror.startState = function(mode, a1, a2) {
    return mode.startState ? mode.startState(a1, a2) : true;
  };

  // Given a mode and a state (for that mode), find the inner mode and
  // state at the position that the state refers to.
  CodeMirror.innerMode = function(mode, state) {
    while (mode.innerMode) {
      var info = mode.innerMode(state);
      if (!info || info.mode == mode) break;
      state = info.state;
      mode = info.mode;
    }
    return info || {mode: mode, state: state};
  };

  // STANDARD COMMANDS

  // Commands are parameter-less actions that can be performed on an
  // editor, mostly used for keybindings.
  var commands = CodeMirror.commands = {
    selectAll: function(cm) {cm.setSelection(Pos(cm.firstLine(), 0), Pos(cm.lastLine()), sel_dontScroll);},
    singleSelection: function(cm) {
      cm.setSelection(cm.getCursor("anchor"), cm.getCursor("head"), sel_dontScroll);
    },
    killLine: function(cm) {
      deleteNearSelection(cm, function(range) {
        if (range.empty()) {
          var len = getLine(cm.doc, range.head.line).text.length;
          if (range.head.ch == len && range.head.line < cm.lastLine())
            return {from: range.head, to: Pos(range.head.line + 1, 0)};
          else
            return {from: range.head, to: Pos(range.head.line, len)};
        } else {
          return {from: range.from(), to: range.to()};
        }
      });
    },
    deleteLine: function(cm) {
      deleteNearSelection(cm, function(range) {
        return {from: Pos(range.from().line, 0),
                to: clipPos(cm.doc, Pos(range.to().line + 1, 0))};
      });
    },
    delLineLeft: function(cm) {
      deleteNearSelection(cm, function(range) {
        return {from: Pos(range.from().line, 0), to: range.from()};
      });
    },
    delWrappedLineLeft: function(cm) {
      deleteNearSelection(cm, function(range) {
        var top = cm.charCoords(range.head, "div").top + 5;
        var leftPos = cm.coordsChar({left: 0, top: top}, "div");
        return {from: leftPos, to: range.from()};
      });
    },
    delWrappedLineRight: function(cm) {
      deleteNearSelection(cm, function(range) {
        var top = cm.charCoords(range.head, "div").top + 5;
        var rightPos = cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div");
        return {from: range.from(), to: rightPos };
      });
    },
    undo: function(cm) {cm.undo();},
    redo: function(cm) {cm.redo();},
    undoSelection: function(cm) {cm.undoSelection();},
    redoSelection: function(cm) {cm.redoSelection();},
    goDocStart: function(cm) {cm.extendSelection(Pos(cm.firstLine(), 0));},
    goDocEnd: function(cm) {cm.extendSelection(Pos(cm.lastLine()));},
    goLineStart: function(cm) {
      cm.extendSelectionsBy(function(range) { return lineStart(cm, range.head.line); },
                            {origin: "+move", bias: 1});
    },
    goLineStartSmart: function(cm) {
      cm.extendSelectionsBy(function(range) {
        return lineStartSmart(cm, range.head);
      }, {origin: "+move", bias: 1});
    },
    goLineEnd: function(cm) {
      cm.extendSelectionsBy(function(range) { return lineEnd(cm, range.head.line); },
                            {origin: "+move", bias: -1});
    },
    goLineRight: function(cm) {
      cm.extendSelectionsBy(function(range) {
        var top = cm.charCoords(range.head, "div").top + 5;
        return cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div");
      }, sel_move);
    },
    goLineLeft: function(cm) {
      cm.extendSelectionsBy(function(range) {
        var top = cm.charCoords(range.head, "div").top + 5;
        return cm.coordsChar({left: 0, top: top}, "div");
      }, sel_move);
    },
    goLineLeftSmart: function(cm) {
      cm.extendSelectionsBy(function(range) {
        var top = cm.charCoords(range.head, "div").top + 5;
        var pos = cm.coordsChar({left: 0, top: top}, "div");
        if (pos.ch < cm.getLine(pos.line).search(/\S/)) return lineStartSmart(cm, range.head);
        return pos;
      }, sel_move);
    },
    goLineUp: function(cm) {cm.moveV(-1, "line");},
    goLineDown: function(cm) {cm.moveV(1, "line");},
    goPageUp: function(cm) {cm.moveV(-1, "page");},
    goPageDown: function(cm) {cm.moveV(1, "page");},
    goCharLeft: function(cm) {cm.moveH(-1, "char");},
    goCharRight: function(cm) {cm.moveH(1, "char");},
    goColumnLeft: function(cm) {cm.moveH(-1, "column");},
    goColumnRight: function(cm) {cm.moveH(1, "column");},
    goWordLeft: function(cm) {cm.moveH(-1, "word");},
    goGroupRight: function(cm) {cm.moveH(1, "group");},
    goGroupLeft: function(cm) {cm.moveH(-1, "group");},
    goWordRight: function(cm) {cm.moveH(1, "word");},
    delCharBefore: function(cm) {cm.deleteH(-1, "char");},
    delCharAfter: function(cm) {cm.deleteH(1, "char");},
    delWordBefore: function(cm) {cm.deleteH(-1, "word");},
    delWordAfter: function(cm) {cm.deleteH(1, "word");},
    delGroupBefore: function(cm) {cm.deleteH(-1, "group");},
    delGroupAfter: function(cm) {cm.deleteH(1, "group");},
    indentAuto: function(cm) {cm.indentSelection("smart");},
    indentMore: function(cm) {cm.indentSelection("add");},
    indentLess: function(cm) {cm.indentSelection("subtract");},
    insertTab: function(cm) {cm.replaceSelection("\t");},
    insertSoftTab: function(cm) {
      var spaces = [], ranges = cm.listSelections(), tabSize = cm.options.tabSize;
      for (var i = 0; i < ranges.length; i++) {
        var pos = ranges[i].from();
        var col = countColumn(cm.getLine(pos.line), pos.ch, tabSize);
        spaces.push(new Array(tabSize - col % tabSize + 1).join(" "));
      }
      cm.replaceSelections(spaces);
    },
    defaultTab: function(cm) {
      if (cm.somethingSelected()) cm.indentSelection("add");
      else cm.execCommand("insertTab");
    },
    transposeChars: function(cm) {
      runInOp(cm, function() {
        var ranges = cm.listSelections(), newSel = [];
        for (var i = 0; i < ranges.length; i++) {
          var cur = ranges[i].head, line = getLine(cm.doc, cur.line).text;
          if (line) {
            if (cur.ch == line.length) cur = new Pos(cur.line, cur.ch - 1);
            if (cur.ch > 0) {
              cur = new Pos(cur.line, cur.ch + 1);
              cm.replaceRange(line.charAt(cur.ch - 1) + line.charAt(cur.ch - 2),
                              Pos(cur.line, cur.ch - 2), cur, "+transpose");
            } else if (cur.line > cm.doc.first) {
              var prev = getLine(cm.doc, cur.line - 1).text;
              if (prev)
                cm.replaceRange(line.charAt(0) + cm.doc.lineSeparator() +
                                prev.charAt(prev.length - 1),
                                Pos(cur.line - 1, prev.length - 1), Pos(cur.line, 1), "+transpose");
            }
          }
          newSel.push(new Range(cur, cur));
        }
        cm.setSelections(newSel);
      });
    },
    newlineAndIndent: function(cm) {
      runInOp(cm, function() {
        var len = cm.listSelections().length;
        for (var i = 0; i < len; i++) {
          var range = cm.listSelections()[i];
          cm.replaceRange(cm.doc.lineSeparator(), range.anchor, range.head, "+input");
          cm.indentLine(range.from().line + 1, null, true);
        }
        ensureCursorVisible(cm);
      });
    },
    toggleOverwrite: function(cm) {cm.toggleOverwrite();}
  };


  // STANDARD KEYMAPS

  var keyMap = CodeMirror.keyMap = {};

  keyMap.basic = {
    "Left": "goCharLeft", "Right": "goCharRight", "Up": "goLineUp", "Down": "goLineDown",
    "End": "goLineEnd", "Home": "goLineStartSmart", "PageUp": "goPageUp", "PageDown": "goPageDown",
    "Delete": "delCharAfter", "Backspace": "delCharBefore", "Shift-Backspace": "delCharBefore",
    "Tab": "defaultTab", "Shift-Tab": "indentAuto",
    "Enter": "newlineAndIndent", "Insert": "toggleOverwrite",
    "Esc": "singleSelection"
  };
  // Note that the save and find-related commands aren't defined by
  // default. User code or addons can define them. Unknown commands
  // are simply ignored.
  keyMap.pcDefault = {
    "Ctrl-A": "selectAll", "Ctrl-D": "deleteLine", "Ctrl-Z": "undo", "Shift-Ctrl-Z": "redo", "Ctrl-Y": "redo",
    "Ctrl-Home": "goDocStart", "Ctrl-End": "goDocEnd", "Ctrl-Up": "goLineUp", "Ctrl-Down": "goLineDown",
    "Ctrl-Left": "goGroupLeft", "Ctrl-Right": "goGroupRight", "Alt-Left": "goLineStart", "Alt-Right": "goLineEnd",
    "Ctrl-Backspace": "delGroupBefore", "Ctrl-Delete": "delGroupAfter", "Ctrl-S": "save", "Ctrl-F": "find",
    "Ctrl-G": "findNext", "Shift-Ctrl-G": "findPrev", "Shift-Ctrl-F": "replace", "Shift-Ctrl-R": "replaceAll",
    "Ctrl-[": "indentLess", "Ctrl-]": "indentMore",
    "Ctrl-U": "undoSelection", "Shift-Ctrl-U": "redoSelection", "Alt-U": "redoSelection",
    fallthrough: "basic"
  };
  // Very basic readline/emacs-style bindings, which are standard on Mac.
  keyMap.emacsy = {
    "Ctrl-F": "goCharRight", "Ctrl-B": "goCharLeft", "Ctrl-P": "goLineUp", "Ctrl-N": "goLineDown",
    "Alt-F": "goWordRight", "Alt-B": "goWordLeft", "Ctrl-A": "goLineStart", "Ctrl-E": "goLineEnd",
    "Ctrl-V": "goPageDown", "Shift-Ctrl-V": "goPageUp", "Ctrl-D": "delCharAfter", "Ctrl-H": "delCharBefore",
    "Alt-D": "delWordAfter", "Alt-Backspace": "delWordBefore", "Ctrl-K": "killLine", "Ctrl-T": "transposeChars"
  };
  keyMap.macDefault = {
    "Cmd-A": "selectAll", "Cmd-D": "deleteLine", "Cmd-Z": "undo", "Shift-Cmd-Z": "redo", "Cmd-Y": "redo",
    "Cmd-Home": "goDocStart", "Cmd-Up": "goDocStart", "Cmd-End": "goDocEnd", "Cmd-Down": "goDocEnd", "Alt-Left": "goGroupLeft",
    "Alt-Right": "goGroupRight", "Cmd-Left": "goLineLeft", "Cmd-Right": "goLineRight", "Alt-Backspace": "delGroupBefore",
    "Ctrl-Alt-Backspace": "delGroupAfter", "Alt-Delete": "delGroupAfter", "Cmd-S": "save", "Cmd-F": "find",
    "Cmd-G": "findNext", "Shift-Cmd-G": "findPrev", "Cmd-Alt-F": "replace", "Shift-Cmd-Alt-F": "replaceAll",
    "Cmd-[": "indentLess", "Cmd-]": "indentMore", "Cmd-Backspace": "delWrappedLineLeft", "Cmd-Delete": "delWrappedLineRight",
    "Cmd-U": "undoSelection", "Shift-Cmd-U": "redoSelection", "Ctrl-Up": "goDocStart", "Ctrl-Down": "goDocEnd",
    fallthrough: ["basic", "emacsy"]
  };
  keyMap["default"] = mac ? keyMap.macDefault : keyMap.pcDefault;

  // KEYMAP DISPATCH

  function normalizeKeyName(name) {
    var parts = name.split(/-(?!$)/), name = parts[parts.length - 1];
    var alt, ctrl, shift, cmd;
    for (var i = 0; i < parts.length - 1; i++) {
      var mod = parts[i];
      if (/^(cmd|meta|m)$/i.test(mod)) cmd = true;
      else if (/^a(lt)?$/i.test(mod)) alt = true;
      else if (/^(c|ctrl|control)$/i.test(mod)) ctrl = true;
      else if (/^s(hift)$/i.test(mod)) shift = true;
      else throw new Error("Unrecognized modifier name: " + mod);
    }
    if (alt) name = "Alt-" + name;
    if (ctrl) name = "Ctrl-" + name;
    if (cmd) name = "Cmd-" + name;
    if (shift) name = "Shift-" + name;
    return name;
  }

  // This is a kludge to keep keymaps mostly working as raw objects
  // (backwards compatibility) while at the same time support features
  // like normalization and multi-stroke key bindings. It compiles a
  // new normalized keymap, and then updates the old object to reflect
  // this.
  CodeMirror.normalizeKeyMap = function(keymap) {
    var copy = {};
    for (var keyname in keymap) if (keymap.hasOwnProperty(keyname)) {
      var value = keymap[keyname];
      if (/^(name|fallthrough|(de|at)tach)$/.test(keyname)) continue;
      if (value == "...") { delete keymap[keyname]; continue; }

      var keys = map(keyname.split(" "), normalizeKeyName);
      for (var i = 0; i < keys.length; i++) {
        var val, name;
        if (i == keys.length - 1) {
          name = keys.join(" ");
          val = value;
        } else {
          name = keys.slice(0, i + 1).join(" ");
          val = "...";
        }
        var prev = copy[name];
        if (!prev) copy[name] = val;
        else if (prev != val) throw new Error("Inconsistent bindings for " + name);
      }
      delete keymap[keyname];
    }
    for (var prop in copy) keymap[prop] = copy[prop];
    return keymap;
  };

  var lookupKey = CodeMirror.lookupKey = function(key, map, handle, context) {
    map = getKeyMap(map);
    var found = map.call ? map.call(key, context) : map[key];
    if (found === false) return "nothing";
    if (found === "...") return "multi";
    if (found != null && handle(found)) return "handled";

    if (map.fallthrough) {
      if (Object.prototype.toString.call(map.fallthrough) != "[object Array]")
        return lookupKey(key, map.fallthrough, handle, context);
      for (var i = 0; i < map.fallthrough.length; i++) {
        var result = lookupKey(key, map.fallthrough[i], handle, context);
        if (result) return result;
      }
    }
  };

  // Modifier key presses don't count as 'real' key presses for the
  // purpose of keymap fallthrough.
  var isModifierKey = CodeMirror.isModifierKey = function(value) {
    var name = typeof value == "string" ? value : keyNames[value.keyCode];
    return name == "Ctrl" || name == "Alt" || name == "Shift" || name == "Mod";
  };

  // Look up the name of a key as indicated by an event object.
  var keyName = CodeMirror.keyName = function(event, noShift) {
    if (presto && event.keyCode == 34 && event["char"]) return false;
    var base = keyNames[event.keyCode], name = base;
    if (name == null || event.altGraphKey) return false;
    if (event.altKey && base != "Alt") name = "Alt-" + name;
    if ((flipCtrlCmd ? event.metaKey : event.ctrlKey) && base != "Ctrl") name = "Ctrl-" + name;
    if ((flipCtrlCmd ? event.ctrlKey : event.metaKey) && base != "Cmd") name = "Cmd-" + name;
    if (!noShift && event.shiftKey && base != "Shift") name = "Shift-" + name;
    return name;
  };

  function getKeyMap(val) {
    return typeof val == "string" ? keyMap[val] : val;
  }

  // FROMTEXTAREA

  CodeMirror.fromTextArea = function(textarea, options) {
    options = options ? copyObj(options) : {};
    options.value = textarea.value;
    if (!options.tabindex && textarea.tabIndex)
      options.tabindex = textarea.tabIndex;
    if (!options.placeholder && textarea.placeholder)
      options.placeholder = textarea.placeholder;
    // Set autofocus to true if this textarea is focused, or if it has
    // autofocus and no other element is focused.
    if (options.autofocus == null) {
      var hasFocus = activeElt();
      options.autofocus = hasFocus == textarea ||
        textarea.getAttribute("autofocus") != null && hasFocus == document.body;
    }

    function save() {textarea.value = cm.getValue();}
    if (textarea.form) {
      on(textarea.form, "submit", save);
      // Deplorable hack to make the submit method do the right thing.
      if (!options.leaveSubmitMethodAlone) {
        var form = textarea.form, realSubmit = form.submit;
        try {
          var wrappedSubmit = form.submit = function() {
            save();
            form.submit = realSubmit;
            form.submit();
            form.submit = wrappedSubmit;
          };
        } catch(e) {}
      }
    }

    options.finishInit = function(cm) {
      cm.save = save;
      cm.getTextArea = function() { return textarea; };
      cm.toTextArea = function() {
        cm.toTextArea = isNaN; // Prevent this from being ran twice
        save();
        textarea.parentNode.removeChild(cm.getWrapperElement());
        textarea.style.display = "";
        if (textarea.form) {
          off(textarea.form, "submit", save);
          if (typeof textarea.form.submit == "function")
            textarea.form.submit = realSubmit;
        }
      };
    };

    textarea.style.display = "none";
    var cm = CodeMirror(function(node) {
      textarea.parentNode.insertBefore(node, textarea.nextSibling);
    }, options);
    return cm;
  };

  // STRING STREAM

  // Fed to the mode parsers, provides helper functions to make
  // parsers more succinct.

  var StringStream = CodeMirror.StringStream = function(string, tabSize) {
    this.pos = this.start = 0;
    this.string = string;
    this.tabSize = tabSize || 8;
    this.lastColumnPos = this.lastColumnValue = 0;
    this.lineStart = 0;
  };

  StringStream.prototype = {
    eol: function() {return this.pos >= this.string.length;},
    sol: function() {return this.pos == this.lineStart;},
    peek: function() {return this.string.charAt(this.pos) || undefined;},
    next: function() {
      if (this.pos < this.string.length)
        return this.string.charAt(this.pos++);
    },
    eat: function(match) {
      var ch = this.string.charAt(this.pos);
      if (typeof match == "string") var ok = ch == match;
      else var ok = ch && (match.test ? match.test(ch) : match(ch));
      if (ok) {++this.pos; return ch;}
    },
    eatWhile: function(match) {
      var start = this.pos;
      while (this.eat(match)){}
      return this.pos > start;
    },
    eatSpace: function() {
      var start = this.pos;
      while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) ++this.pos;
      return this.pos > start;
    },
    skipToEnd: function() {this.pos = this.string.length;},
    skipTo: function(ch) {
      var found = this.string.indexOf(ch, this.pos);
      if (found > -1) {this.pos = found; return true;}
    },
    backUp: function(n) {this.pos -= n;},
    column: function() {
      if (this.lastColumnPos < this.start) {
        this.lastColumnValue = countColumn(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue);
        this.lastColumnPos = this.start;
      }
      return this.lastColumnValue - (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
    },
    indentation: function() {
      return countColumn(this.string, null, this.tabSize) -
        (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
    },
    match: function(pattern, consume, caseInsensitive) {
      if (typeof pattern == "string") {
        var cased = function(str) {return caseInsensitive ? str.toLowerCase() : str;};
        var substr = this.string.substr(this.pos, pattern.length);
        if (cased(substr) == cased(pattern)) {
          if (consume !== false) this.pos += pattern.length;
          return true;
        }
      } else {
        var match = this.string.slice(this.pos).match(pattern);
        if (match && match.index > 0) return null;
        if (match && consume !== false) this.pos += match[0].length;
        return match;
      }
    },
    current: function(){return this.string.slice(this.start, this.pos);},
    hideFirstChars: function(n, inner) {
      this.lineStart += n;
      try { return inner(); }
      finally { this.lineStart -= n; }
    }
  };

  // TEXTMARKERS

  // Created with markText and setBookmark methods. A TextMarker is a
  // handle that can be used to clear or find a marked position in the
  // document. Line objects hold arrays (markedSpans) containing
  // {from, to, marker} object pointing to such marker objects, and
  // indicating that such a marker is present on that line. Multiple
  // lines may point to the same marker when it spans across lines.
  // The spans will have null for their from/to properties when the
  // marker continues beyond the start/end of the line. Markers have
  // links back to the lines they currently touch.

  var nextMarkerId = 0;

  var TextMarker = CodeMirror.TextMarker = function(doc, type) {
    this.lines = [];
    this.type = type;
    this.doc = doc;
    this.id = ++nextMarkerId;
  };
  eventMixin(TextMarker);

  // Clear the marker.
  TextMarker.prototype.clear = function() {
    if (this.explicitlyCleared) return;
    var cm = this.doc.cm, withOp = cm && !cm.curOp;
    if (withOp) startOperation(cm);
    if (hasHandler(this, "clear")) {
      var found = this.find();
      if (found) signalLater(this, "clear", found.from, found.to);
    }
    var min = null, max = null;
    for (var i = 0; i < this.lines.length; ++i) {
      var line = this.lines[i];
      var span = getMarkedSpanFor(line.markedSpans, this);
      if (cm && !this.collapsed) regLineChange(cm, lineNo(line), "text");
      else if (cm) {
        if (span.to != null) max = lineNo(line);
        if (span.from != null) min = lineNo(line);
      }
      line.markedSpans = removeMarkedSpan(line.markedSpans, span);
      if (span.from == null && this.collapsed && !lineIsHidden(this.doc, line) && cm)
        updateLineHeight(line, textHeight(cm.display));
    }
    if (cm && this.collapsed && !cm.options.lineWrapping) for (var i = 0; i < this.lines.length; ++i) {
      var visual = visualLine(this.lines[i]), len = lineLength(visual);
      if (len > cm.display.maxLineLength) {
        cm.display.maxLine = visual;
        cm.display.maxLineLength = len;
        cm.display.maxLineChanged = true;
      }
    }

    if (min != null && cm && this.collapsed) regChange(cm, min, max + 1);
    this.lines.length = 0;
    this.explicitlyCleared = true;
    if (this.atomic && this.doc.cantEdit) {
      this.doc.cantEdit = false;
      if (cm) reCheckSelection(cm.doc);
    }
    if (cm) signalLater(cm, "markerCleared", cm, this);
    if (withOp) endOperation(cm);
    if (this.parent) this.parent.clear();
  };

  // Find the position of the marker in the document. Returns a {from,
  // to} object by default. Side can be passed to get a specific side
  // -- 0 (both), -1 (left), or 1 (right). When lineObj is true, the
  // Pos objects returned contain a line object, rather than a line
  // number (used to prevent looking up the same line twice).
  TextMarker.prototype.find = function(side, lineObj) {
    if (side == null && this.type == "bookmark") side = 1;
    var from, to;
    for (var i = 0; i < this.lines.length; ++i) {
      var line = this.lines[i];
      var span = getMarkedSpanFor(line.markedSpans, this);
      if (span.from != null) {
        from = Pos(lineObj ? line : lineNo(line), span.from);
        if (side == -1) return from;
      }
      if (span.to != null) {
        to = Pos(lineObj ? line : lineNo(line), span.to);
        if (side == 1) return to;
      }
    }
    return from && {from: from, to: to};
  };

  // Signals that the marker's widget changed, and surrounding layout
  // should be recomputed.
  TextMarker.prototype.changed = function() {
    var pos = this.find(-1, true), widget = this, cm = this.doc.cm;
    if (!pos || !cm) return;
    runInOp(cm, function() {
      var line = pos.line, lineN = lineNo(pos.line);
      var view = findViewForLine(cm, lineN);
      if (view) {
        clearLineMeasurementCacheFor(view);
        cm.curOp.selectionChanged = cm.curOp.forceUpdate = true;
      }
      cm.curOp.updateMaxLine = true;
      if (!lineIsHidden(widget.doc, line) && widget.height != null) {
        var oldHeight = widget.height;
        widget.height = null;
        var dHeight = widgetHeight(widget) - oldHeight;
        if (dHeight)
          updateLineHeight(line, line.height + dHeight);
      }
    });
  };

  TextMarker.prototype.attachLine = function(line) {
    if (!this.lines.length && this.doc.cm) {
      var op = this.doc.cm.curOp;
      if (!op.maybeHiddenMarkers || indexOf(op.maybeHiddenMarkers, this) == -1)
        (op.maybeUnhiddenMarkers || (op.maybeUnhiddenMarkers = [])).push(this);
    }
    this.lines.push(line);
  };
  TextMarker.prototype.detachLine = function(line) {
    this.lines.splice(indexOf(this.lines, line), 1);
    if (!this.lines.length && this.doc.cm) {
      var op = this.doc.cm.curOp;
      (op.maybeHiddenMarkers || (op.maybeHiddenMarkers = [])).push(this);
    }
  };

  // Collapsed markers have unique ids, in order to be able to order
  // them, which is needed for uniquely determining an outer marker
  // when they overlap (they may nest, but not partially overlap).
  var nextMarkerId = 0;

  // Create a marker, wire it up to the right lines, and
  function markText(doc, from, to, options, type) {
    // Shared markers (across linked documents) are handled separately
    // (markTextShared will call out to this again, once per
    // document).
    if (options && options.shared) return markTextShared(doc, from, to, options, type);
    // Ensure we are in an operation.
    if (doc.cm && !doc.cm.curOp) return operation(doc.cm, markText)(doc, from, to, options, type);

    var marker = new TextMarker(doc, type), diff = cmp(from, to);
    if (options) copyObj(options, marker, false);
    // Don't connect empty markers unless clearWhenEmpty is false
    if (diff > 0 || diff == 0 && marker.clearWhenEmpty !== false)
      return marker;
    if (marker.replacedWith) {
      // Showing up as a widget implies collapsed (widget replaces text)
      marker.collapsed = true;
      marker.widgetNode = elt("span", [marker.replacedWith], "CodeMirror-widget");
      if (!options.handleMouseEvents) marker.widgetNode.setAttribute("cm-ignore-events", "true");
      if (options.insertLeft) marker.widgetNode.insertLeft = true;
    }
    if (marker.collapsed) {
      if (conflictingCollapsedRange(doc, from.line, from, to, marker) ||
          from.line != to.line && conflictingCollapsedRange(doc, to.line, from, to, marker))
        throw new Error("Inserting collapsed marker partially overlapping an existing one");
      sawCollapsedSpans = true;
    }

    if (marker.addToHistory)
      addChangeToHistory(doc, {from: from, to: to, origin: "markText"}, doc.sel, NaN);

    var curLine = from.line, cm = doc.cm, updateMaxLine;
    doc.iter(curLine, to.line + 1, function(line) {
      if (cm && marker.collapsed && !cm.options.lineWrapping && visualLine(line) == cm.display.maxLine)
        updateMaxLine = true;
      if (marker.collapsed && curLine != from.line) updateLineHeight(line, 0);
      addMarkedSpan(line, new MarkedSpan(marker,
                                         curLine == from.line ? from.ch : null,
                                         curLine == to.line ? to.ch : null));
      ++curLine;
    });
    // lineIsHidden depends on the presence of the spans, so needs a second pass
    if (marker.collapsed) doc.iter(from.line, to.line + 1, function(line) {
      if (lineIsHidden(doc, line)) updateLineHeight(line, 0);
    });

    if (marker.clearOnEnter) on(marker, "beforeCursorEnter", function() { marker.clear(); });

    if (marker.readOnly) {
      sawReadOnlySpans = true;
      if (doc.history.done.length || doc.history.undone.length)
        doc.clearHistory();
    }
    if (marker.collapsed) {
      marker.id = ++nextMarkerId;
      marker.atomic = true;
    }
    if (cm) {
      // Sync editor state
      if (updateMaxLine) cm.curOp.updateMaxLine = true;
      if (marker.collapsed)
        regChange(cm, from.line, to.line + 1);
      else if (marker.className || marker.title || marker.startStyle || marker.endStyle || marker.css)
        for (var i = from.line; i <= to.line; i++) regLineChange(cm, i, "text");
      if (marker.atomic) reCheckSelection(cm.doc);
      signalLater(cm, "markerAdded", cm, marker);
    }
    return marker;
  }

  // SHARED TEXTMARKERS

  // A shared marker spans multiple linked documents. It is
  // implemented as a meta-marker-object controlling multiple normal
  // markers.
  var SharedTextMarker = CodeMirror.SharedTextMarker = function(markers, primary) {
    this.markers = markers;
    this.primary = primary;
    for (var i = 0; i < markers.length; ++i)
      markers[i].parent = this;
  };
  eventMixin(SharedTextMarker);

  SharedTextMarker.prototype.clear = function() {
    if (this.explicitlyCleared) return;
    this.explicitlyCleared = true;
    for (var i = 0; i < this.markers.length; ++i)
      this.markers[i].clear();
    signalLater(this, "clear");
  };
  SharedTextMarker.prototype.find = function(side, lineObj) {
    return this.primary.find(side, lineObj);
  };

  function markTextShared(doc, from, to, options, type) {
    options = copyObj(options);
    options.shared = false;
    var markers = [markText(doc, from, to, options, type)], primary = markers[0];
    var widget = options.widgetNode;
    linkedDocs(doc, function(doc) {
      if (widget) options.widgetNode = widget.cloneNode(true);
      markers.push(markText(doc, clipPos(doc, from), clipPos(doc, to), options, type));
      for (var i = 0; i < doc.linked.length; ++i)
        if (doc.linked[i].isParent) return;
      primary = lst(markers);
    });
    return new SharedTextMarker(markers, primary);
  }

  function findSharedMarkers(doc) {
    return doc.findMarks(Pos(doc.first, 0), doc.clipPos(Pos(doc.lastLine())),
                         function(m) { return m.parent; });
  }

  function copySharedMarkers(doc, markers) {
    for (var i = 0; i < markers.length; i++) {
      var marker = markers[i], pos = marker.find();
      var mFrom = doc.clipPos(pos.from), mTo = doc.clipPos(pos.to);
      if (cmp(mFrom, mTo)) {
        var subMark = markText(doc, mFrom, mTo, marker.primary, marker.primary.type);
        marker.markers.push(subMark);
        subMark.parent = marker;
      }
    }
  }

  function detachSharedMarkers(markers) {
    for (var i = 0; i < markers.length; i++) {
      var marker = markers[i], linked = [marker.primary.doc];;
      linkedDocs(marker.primary.doc, function(d) { linked.push(d); });
      for (var j = 0; j < marker.markers.length; j++) {
        var subMarker = marker.markers[j];
        if (indexOf(linked, subMarker.doc) == -1) {
          subMarker.parent = null;
          marker.markers.splice(j--, 1);
        }
      }
    }
  }

  // TEXTMARKER SPANS

  function MarkedSpan(marker, from, to) {
    this.marker = marker;
    this.from = from; this.to = to;
  }

  // Search an array of spans for a span matching the given marker.
  function getMarkedSpanFor(spans, marker) {
    if (spans) for (var i = 0; i < spans.length; ++i) {
      var span = spans[i];
      if (span.marker == marker) return span;
    }
  }
  // Remove a span from an array, returning undefined if no spans are
  // left (we don't store arrays for lines without spans).
  function removeMarkedSpan(spans, span) {
    for (var r, i = 0; i < spans.length; ++i)
      if (spans[i] != span) (r || (r = [])).push(spans[i]);
    return r;
  }
  // Add a span to a line.
  function addMarkedSpan(line, span) {
    line.markedSpans = line.markedSpans ? line.markedSpans.concat([span]) : [span];
    span.marker.attachLine(line);
  }

  // Used for the algorithm that adjusts markers for a change in the
  // document. These functions cut an array of spans at a given
  // character position, returning an array of remaining chunks (or
  // undefined if nothing remains).
  function markedSpansBefore(old, startCh, isInsert) {
    if (old) for (var i = 0, nw; i < old.length; ++i) {
      var span = old[i], marker = span.marker;
      var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= startCh : span.from < startCh);
      if (startsBefore || span.from == startCh && marker.type == "bookmark" && (!isInsert || !span.marker.insertLeft)) {
        var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= startCh : span.to > startCh);
        (nw || (nw = [])).push(new MarkedSpan(marker, span.from, endsAfter ? null : span.to));
      }
    }
    return nw;
  }
  function markedSpansAfter(old, endCh, isInsert) {
    if (old) for (var i = 0, nw; i < old.length; ++i) {
      var span = old[i], marker = span.marker;
      var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= endCh : span.to > endCh);
      if (endsAfter || span.from == endCh && marker.type == "bookmark" && (!isInsert || span.marker.insertLeft)) {
        var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= endCh : span.from < endCh);
        (nw || (nw = [])).push(new MarkedSpan(marker, startsBefore ? null : span.from - endCh,
                                              span.to == null ? null : span.to - endCh));
      }
    }
    return nw;
  }

  // Given a change object, compute the new set of marker spans that
  // cover the line in which the change took place. Removes spans
  // entirely within the change, reconnects spans belonging to the
  // same marker that appear on both sides of the change, and cuts off
  // spans partially within the change. Returns an array of span
  // arrays with one element for each line in (after) the change.
  function stretchSpansOverChange(doc, change) {
    if (change.full) return null;
    var oldFirst = isLine(doc, change.from.line) && getLine(doc, change.from.line).markedSpans;
    var oldLast = isLine(doc, change.to.line) && getLine(doc, change.to.line).markedSpans;
    if (!oldFirst && !oldLast) return null;

    var startCh = change.from.ch, endCh = change.to.ch, isInsert = cmp(change.from, change.to) == 0;
    // Get the spans that 'stick out' on both sides
    var first = markedSpansBefore(oldFirst, startCh, isInsert);
    var last = markedSpansAfter(oldLast, endCh, isInsert);

    // Next, merge those two ends
    var sameLine = change.text.length == 1, offset = lst(change.text).length + (sameLine ? startCh : 0);
    if (first) {
      // Fix up .to properties of first
      for (var i = 0; i < first.length; ++i) {
        var span = first[i];
        if (span.to == null) {
          var found = getMarkedSpanFor(last, span.marker);
          if (!found) span.to = startCh;
          else if (sameLine) span.to = found.to == null ? null : found.to + offset;
        }
      }
    }
    if (last) {
      // Fix up .from in last (or move them into first in case of sameLine)
      for (var i = 0; i < last.length; ++i) {
        var span = last[i];
        if (span.to != null) span.to += offset;
        if (span.from == null) {
          var found = getMarkedSpanFor(first, span.marker);
          if (!found) {
            span.from = offset;
            if (sameLine) (first || (first = [])).push(span);
          }
        } else {
          span.from += offset;
          if (sameLine) (first || (first = [])).push(span);
        }
      }
    }
    // Make sure we didn't create any zero-length spans
    if (first) first = clearEmptySpans(first);
    if (last && last != first) last = clearEmptySpans(last);

    var newMarkers = [first];
    if (!sameLine) {
      // Fill gap with whole-line-spans
      var gap = change.text.length - 2, gapMarkers;
      if (gap > 0 && first)
        for (var i = 0; i < first.length; ++i)
          if (first[i].to == null)
            (gapMarkers || (gapMarkers = [])).push(new MarkedSpan(first[i].marker, null, null));
      for (var i = 0; i < gap; ++i)
        newMarkers.push(gapMarkers);
      newMarkers.push(last);
    }
    return newMarkers;
  }

  // Remove spans that are empty and don't have a clearWhenEmpty
  // option of false.
  function clearEmptySpans(spans) {
    for (var i = 0; i < spans.length; ++i) {
      var span = spans[i];
      if (span.from != null && span.from == span.to && span.marker.clearWhenEmpty !== false)
        spans.splice(i--, 1);
    }
    if (!spans.length) return null;
    return spans;
  }

  // Used for un/re-doing changes from the history. Combines the
  // result of computing the existing spans with the set of spans that
  // existed in the history (so that deleting around a span and then
  // undoing brings back the span).
  function mergeOldSpans(doc, change) {
    var old = getOldSpans(doc, change);
    var stretched = stretchSpansOverChange(doc, change);
    if (!old) return stretched;
    if (!stretched) return old;

    for (var i = 0; i < old.length; ++i) {
      var oldCur = old[i], stretchCur = stretched[i];
      if (oldCur && stretchCur) {
        spans: for (var j = 0; j < stretchCur.length; ++j) {
          var span = stretchCur[j];
          for (var k = 0; k < oldCur.length; ++k)
            if (oldCur[k].marker == span.marker) continue spans;
          oldCur.push(span);
        }
      } else if (stretchCur) {
        old[i] = stretchCur;
      }
    }
    return old;
  }

  // Used to 'clip' out readOnly ranges when making a change.
  function removeReadOnlyRanges(doc, from, to) {
    var markers = null;
    doc.iter(from.line, to.line + 1, function(line) {
      if (line.markedSpans) for (var i = 0; i < line.markedSpans.length; ++i) {
        var mark = line.markedSpans[i].marker;
        if (mark.readOnly && (!markers || indexOf(markers, mark) == -1))
          (markers || (markers = [])).push(mark);
      }
    });
    if (!markers) return null;
    var parts = [{from: from, to: to}];
    for (var i = 0; i < markers.length; ++i) {
      var mk = markers[i], m = mk.find(0);
      for (var j = 0; j < parts.length; ++j) {
        var p = parts[j];
        if (cmp(p.to, m.from) < 0 || cmp(p.from, m.to) > 0) continue;
        var newParts = [j, 1], dfrom = cmp(p.from, m.from), dto = cmp(p.to, m.to);
        if (dfrom < 0 || !mk.inclusiveLeft && !dfrom)
          newParts.push({from: p.from, to: m.from});
        if (dto > 0 || !mk.inclusiveRight && !dto)
          newParts.push({from: m.to, to: p.to});
        parts.splice.apply(parts, newParts);
        j += newParts.length - 1;
      }
    }
    return parts;
  }

  // Connect or disconnect spans from a line.
  function detachMarkedSpans(line) {
    var spans = line.markedSpans;
    if (!spans) return;
    for (var i = 0; i < spans.length; ++i)
      spans[i].marker.detachLine(line);
    line.markedSpans = null;
  }
  function attachMarkedSpans(line, spans) {
    if (!spans) return;
    for (var i = 0; i < spans.length; ++i)
      spans[i].marker.attachLine(line);
    line.markedSpans = spans;
  }

  // Helpers used when computing which overlapping collapsed span
  // counts as the larger one.
  function extraLeft(marker) { return marker.inclusiveLeft ? -1 : 0; }
  function extraRight(marker) { return marker.inclusiveRight ? 1 : 0; }

  // Returns a number indicating which of two overlapping collapsed
  // spans is larger (and thus includes the other). Falls back to
  // comparing ids when the spans cover exactly the same range.
  function compareCollapsedMarkers(a, b) {
    var lenDiff = a.lines.length - b.lines.length;
    if (lenDiff != 0) return lenDiff;
    var aPos = a.find(), bPos = b.find();
    var fromCmp = cmp(aPos.from, bPos.from) || extraLeft(a) - extraLeft(b);
    if (fromCmp) return -fromCmp;
    var toCmp = cmp(aPos.to, bPos.to) || extraRight(a) - extraRight(b);
    if (toCmp) return toCmp;
    return b.id - a.id;
  }

  // Find out whether a line ends or starts in a collapsed span. If
  // so, return the marker for that span.
  function collapsedSpanAtSide(line, start) {
    var sps = sawCollapsedSpans && line.markedSpans, found;
    if (sps) for (var sp, i = 0; i < sps.length; ++i) {
      sp = sps[i];
      if (sp.marker.collapsed && (start ? sp.from : sp.to) == null &&
          (!found || compareCollapsedMarkers(found, sp.marker) < 0))
        found = sp.marker;
    }
    return found;
  }
  function collapsedSpanAtStart(line) { return collapsedSpanAtSide(line, true); }
  function collapsedSpanAtEnd(line) { return collapsedSpanAtSide(line, false); }

  // Test whether there exists a collapsed span that partially
  // overlaps (covers the start or end, but not both) of a new span.
  // Such overlap is not allowed.
  function conflictingCollapsedRange(doc, lineNo, from, to, marker) {
    var line = getLine(doc, lineNo);
    var sps = sawCollapsedSpans && line.markedSpans;
    if (sps) for (var i = 0; i < sps.length; ++i) {
      var sp = sps[i];
      if (!sp.marker.collapsed) continue;
      var found = sp.marker.find(0);
      var fromCmp = cmp(found.from, from) || extraLeft(sp.marker) - extraLeft(marker);
      var toCmp = cmp(found.to, to) || extraRight(sp.marker) - extraRight(marker);
      if (fromCmp >= 0 && toCmp <= 0 || fromCmp <= 0 && toCmp >= 0) continue;
      if (fromCmp <= 0 && (cmp(found.to, from) > 0 || (sp.marker.inclusiveRight && marker.inclusiveLeft)) ||
          fromCmp >= 0 && (cmp(found.from, to) < 0 || (sp.marker.inclusiveLeft && marker.inclusiveRight)))
        return true;
    }
  }

  // A visual line is a line as drawn on the screen. Folding, for
  // example, can cause multiple logical lines to appear on the same
  // visual line. This finds the start of the visual line that the
  // given line is part of (usually that is the line itself).
  function visualLine(line) {
    var merged;
    while (merged = collapsedSpanAtStart(line))
      line = merged.find(-1, true).line;
    return line;
  }

  // Returns an array of logical lines that continue the visual line
  // started by the argument, or undefined if there are no such lines.
  function visualLineContinued(line) {
    var merged, lines;
    while (merged = collapsedSpanAtEnd(line)) {
      line = merged.find(1, true).line;
      (lines || (lines = [])).push(line);
    }
    return lines;
  }

  // Get the line number of the start of the visual line that the
  // given line number is part of.
  function visualLineNo(doc, lineN) {
    var line = getLine(doc, lineN), vis = visualLine(line);
    if (line == vis) return lineN;
    return lineNo(vis);
  }
  // Get the line number of the start of the next visual line after
  // the given line.
  function visualLineEndNo(doc, lineN) {
    if (lineN > doc.lastLine()) return lineN;
    var line = getLine(doc, lineN), merged;
    if (!lineIsHidden(doc, line)) return lineN;
    while (merged = collapsedSpanAtEnd(line))
      line = merged.find(1, true).line;
    return lineNo(line) + 1;
  }

  // Compute whether a line is hidden. Lines count as hidden when they
  // are part of a visual line that starts with another line, or when
  // they are entirely covered by collapsed, non-widget span.
  function lineIsHidden(doc, line) {
    var sps = sawCollapsedSpans && line.markedSpans;
    if (sps) for (var sp, i = 0; i < sps.length; ++i) {
      sp = sps[i];
      if (!sp.marker.collapsed) continue;
      if (sp.from == null) return true;
      if (sp.marker.widgetNode) continue;
      if (sp.from == 0 && sp.marker.inclusiveLeft && lineIsHiddenInner(doc, line, sp))
        return true;
    }
  }
  function lineIsHiddenInner(doc, line, span) {
    if (span.to == null) {
      var end = span.marker.find(1, true);
      return lineIsHiddenInner(doc, end.line, getMarkedSpanFor(end.line.markedSpans, span.marker));
    }
    if (span.marker.inclusiveRight && span.to == line.text.length)
      return true;
    for (var sp, i = 0; i < line.markedSpans.length; ++i) {
      sp = line.markedSpans[i];
      if (sp.marker.collapsed && !sp.marker.widgetNode && sp.from == span.to &&
          (sp.to == null || sp.to != span.from) &&
          (sp.marker.inclusiveLeft || span.marker.inclusiveRight) &&
          lineIsHiddenInner(doc, line, sp)) return true;
    }
  }

  // LINE WIDGETS

  // Line widgets are block elements displayed above or below a line.

  var LineWidget = CodeMirror.LineWidget = function(doc, node, options) {
    if (options) for (var opt in options) if (options.hasOwnProperty(opt))
      this[opt] = options[opt];
    this.doc = doc;
    this.node = node;
  };
  eventMixin(LineWidget);

  function adjustScrollWhenAboveVisible(cm, line, diff) {
    if (heightAtLine(line) < ((cm.curOp && cm.curOp.scrollTop) || cm.doc.scrollTop))
      addToScrollPos(cm, null, diff);
  }

  LineWidget.prototype.clear = function() {
    var cm = this.doc.cm, ws = this.line.widgets, line = this.line, no = lineNo(line);
    if (no == null || !ws) return;
    for (var i = 0; i < ws.length; ++i) if (ws[i] == this) ws.splice(i--, 1);
    if (!ws.length) line.widgets = null;
    var height = widgetHeight(this);
    updateLineHeight(line, Math.max(0, line.height - height));
    if (cm) runInOp(cm, function() {
      adjustScrollWhenAboveVisible(cm, line, -height);
      regLineChange(cm, no, "widget");
    });
  };
  LineWidget.prototype.changed = function() {
    var oldH = this.height, cm = this.doc.cm, line = this.line;
    this.height = null;
    var diff = widgetHeight(this) - oldH;
    if (!diff) return;
    updateLineHeight(line, line.height + diff);
    if (cm) runInOp(cm, function() {
      cm.curOp.forceUpdate = true;
      adjustScrollWhenAboveVisible(cm, line, diff);
    });
  };

  function widgetHeight(widget) {
    if (widget.height != null) return widget.height;
    var cm = widget.doc.cm;
    if (!cm) return 0;
    if (!contains(document.body, widget.node)) {
      var parentStyle = "position: relative;";
      if (widget.coverGutter)
        parentStyle += "margin-left: -" + cm.display.gutters.offsetWidth + "px;";
      if (widget.noHScroll)
        parentStyle += "width: " + cm.display.wrapper.clientWidth + "px;";
      removeChildrenAndAdd(cm.display.measure, elt("div", [widget.node], null, parentStyle));
    }
    return widget.height = widget.node.offsetHeight;
  }

  function addLineWidget(doc, handle, node, options) {
    var widget = new LineWidget(doc, node, options);
    var cm = doc.cm;
    if (cm && widget.noHScroll) cm.display.alignWidgets = true;
    changeLine(doc, handle, "widget", function(line) {
      var widgets = line.widgets || (line.widgets = []);
      if (widget.insertAt == null) widgets.push(widget);
      else widgets.splice(Math.min(widgets.length - 1, Math.max(0, widget.insertAt)), 0, widget);
      widget.line = line;
      if (cm && !lineIsHidden(doc, line)) {
        var aboveVisible = heightAtLine(line) < doc.scrollTop;
        updateLineHeight(line, line.height + widgetHeight(widget));
        if (aboveVisible) addToScrollPos(cm, null, widget.height);
        cm.curOp.forceUpdate = true;
      }
      return true;
    });
    return widget;
  }

  // LINE DATA STRUCTURE

  // Line objects. These hold state related to a line, including
  // highlighting info (the styles array).
  var Line = CodeMirror.Line = function(text, markedSpans, estimateHeight) {
    this.text = text;
    attachMarkedSpans(this, markedSpans);
    this.height = estimateHeight ? estimateHeight(this) : 1;
  };
  eventMixin(Line);
  Line.prototype.lineNo = function() { return lineNo(this); };

  // Change the content (text, markers) of a line. Automatically
  // invalidates cached information and tries to re-estimate the
  // line's height.
  function updateLine(line, text, markedSpans, estimateHeight) {
    line.text = text;
    if (line.stateAfter) line.stateAfter = null;
    if (line.styles) line.styles = null;
    if (line.order != null) line.order = null;
    detachMarkedSpans(line);
    attachMarkedSpans(line, markedSpans);
    var estHeight = estimateHeight ? estimateHeight(line) : 1;
    if (estHeight != line.height) updateLineHeight(line, estHeight);
  }

  // Detach a line from the document tree and its markers.
  function cleanUpLine(line) {
    line.parent = null;
    detachMarkedSpans(line);
  }

  function extractLineClasses(type, output) {
    if (type) for (;;) {
      var lineClass = type.match(/(?:^|\s+)line-(background-)?(\S+)/);
      if (!lineClass) break;
      type = type.slice(0, lineClass.index) + type.slice(lineClass.index + lineClass[0].length);
      var prop = lineClass[1] ? "bgClass" : "textClass";
      if (output[prop] == null)
        output[prop] = lineClass[2];
      else if (!(new RegExp("(?:^|\s)" + lineClass[2] + "(?:$|\s)")).test(output[prop]))
        output[prop] += " " + lineClass[2];
    }
    return type;
  }

  function callBlankLine(mode, state) {
    if (mode.blankLine) return mode.blankLine(state);
    if (!mode.innerMode) return;
    var inner = CodeMirror.innerMode(mode, state);
    if (inner.mode.blankLine) return inner.mode.blankLine(inner.state);
  }

  function readToken(mode, stream, state, inner) {
    for (var i = 0; i < 10; i++) {
      if (inner) inner[0] = CodeMirror.innerMode(mode, state).mode;
      var style = mode.token(stream, state);
      if (stream.pos > stream.start) return style;
    }
    throw new Error("Mode " + mode.name + " failed to advance stream.");
  }

  // Utility for getTokenAt and getLineTokens
  function takeToken(cm, pos, precise, asArray) {
    function getObj(copy) {
      return {start: stream.start, end: stream.pos,
              string: stream.current(),
              type: style || null,
              state: copy ? copyState(doc.mode, state) : state};
    }

    var doc = cm.doc, mode = doc.mode, style;
    pos = clipPos(doc, pos);
    var line = getLine(doc, pos.line), state = getStateBefore(cm, pos.line, precise);
    var stream = new StringStream(line.text, cm.options.tabSize), tokens;
    if (asArray) tokens = [];
    while ((asArray || stream.pos < pos.ch) && !stream.eol()) {
      stream.start = stream.pos;
      style = readToken(mode, stream, state);
      if (asArray) tokens.push(getObj(true));
    }
    return asArray ? tokens : getObj();
  }

  // Run the given mode's parser over a line, calling f for each token.
  function runMode(cm, text, mode, state, f, lineClasses, forceToEnd) {
    var flattenSpans = mode.flattenSpans;
    if (flattenSpans == null) flattenSpans = cm.options.flattenSpans;
    var curStart = 0, curStyle = null;
    var stream = new StringStream(text, cm.options.tabSize), style;
    var inner = cm.options.addModeClass && [null];
    if (text == "") extractLineClasses(callBlankLine(mode, state), lineClasses);
    while (!stream.eol()) {
      if (stream.pos > cm.options.maxHighlightLength) {
        flattenSpans = false;
        if (forceToEnd) processLine(cm, text, state, stream.pos);
        stream.pos = text.length;
        style = null;
      } else {
        style = extractLineClasses(readToken(mode, stream, state, inner), lineClasses);
      }
      if (inner) {
        var mName = inner[0].name;
        if (mName) style = "m-" + (style ? mName + " " + style : mName);
      }
      if (!flattenSpans || curStyle != style) {
        while (curStart < stream.start) {
          curStart = Math.min(stream.start, curStart + 50000);
          f(curStart, curStyle);
        }
        curStyle = style;
      }
      stream.start = stream.pos;
    }
    while (curStart < stream.pos) {
      // Webkit seems to refuse to render text nodes longer than 57444 characters
      var pos = Math.min(stream.pos, curStart + 50000);
      f(pos, curStyle);
      curStart = pos;
    }
  }

  // Compute a style array (an array starting with a mode generation
  // -- for invalidation -- followed by pairs of end positions and
  // style strings), which is used to highlight the tokens on the
  // line.
  function highlightLine(cm, line, state, forceToEnd) {
    // A styles array always starts with a number identifying the
    // mode/overlays that it is based on (for easy invalidation).
    var st = [cm.state.modeGen], lineClasses = {};
    // Compute the base array of styles
    runMode(cm, line.text, cm.doc.mode, state, function(end, style) {
      st.push(end, style);
    }, lineClasses, forceToEnd);

    // Run overlays, adjust style array.
    for (var o = 0; o < cm.state.overlays.length; ++o) {
      var overlay = cm.state.overlays[o], i = 1, at = 0;
      runMode(cm, line.text, overlay.mode, true, function(end, style) {
        var start = i;
        // Ensure there's a token end at the current position, and that i points at it
        while (at < end) {
          var i_end = st[i];
          if (i_end > end)
            st.splice(i, 1, end, st[i+1], i_end);
          i += 2;
          at = Math.min(end, i_end);
        }
        if (!style) return;
        if (overlay.opaque) {
          st.splice(start, i - start, end, "cm-overlay " + style);
          i = start + 2;
        } else {
          for (; start < i; start += 2) {
            var cur = st[start+1];
            st[start+1] = (cur ? cur + " " : "") + "cm-overlay " + style;
          }
        }
      }, lineClasses);
    }

    return {styles: st, classes: lineClasses.bgClass || lineClasses.textClass ? lineClasses : null};
  }

  function getLineStyles(cm, line, updateFrontier) {
    if (!line.styles || line.styles[0] != cm.state.modeGen) {
      var state = getStateBefore(cm, lineNo(line));
      var result = highlightLine(cm, line, line.text.length > cm.options.maxHighlightLength ? copyState(cm.doc.mode, state) : state);
      line.stateAfter = state;
      line.styles = result.styles;
      if (result.classes) line.styleClasses = result.classes;
      else if (line.styleClasses) line.styleClasses = null;
      if (updateFrontier === cm.doc.frontier) cm.doc.frontier++;
    }
    return line.styles;
  }

  // Lightweight form of highlight -- proceed over this line and
  // update state, but don't save a style array. Used for lines that
  // aren't currently visible.
  function processLine(cm, text, state, startAt) {
    var mode = cm.doc.mode;
    var stream = new StringStream(text, cm.options.tabSize);
    stream.start = stream.pos = startAt || 0;
    if (text == "") callBlankLine(mode, state);
    while (!stream.eol()) {
      readToken(mode, stream, state);
      stream.start = stream.pos;
    }
  }

  // Convert a style as returned by a mode (either null, or a string
  // containing one or more styles) to a CSS style. This is cached,
  // and also looks for line-wide styles.
  var styleToClassCache = {}, styleToClassCacheWithMode = {};
  function interpretTokenStyle(style, options) {
    if (!style || /^\s*$/.test(style)) return null;
    var cache = options.addModeClass ? styleToClassCacheWithMode : styleToClassCache;
    return cache[style] ||
      (cache[style] = style.replace(/\S+/g, "cm-$&"));
  }

  // Render the DOM representation of the text of a line. Also builds
  // up a 'line map', which points at the DOM nodes that represent
  // specific stretches of text, and is used by the measuring code.
  // The returned object contains the DOM node, this map, and
  // information about line-wide styles that were set by the mode.
  function buildLineContent(cm, lineView) {
    // The padding-right forces the element to have a 'border', which
    // is needed on Webkit to be able to get line-level bounding
    // rectangles for it (in measureChar).
    var content = elt("span", null, null, webkit ? "padding-right: .1px" : null);
    var builder = {pre: elt("pre", [content], "CodeMirror-line"), content: content,
                   col: 0, pos: 0, cm: cm,
                   splitSpaces: (ie || webkit) && cm.getOption("lineWrapping")};
    lineView.measure = {};

    // Iterate over the logical lines that make up this visual line.
    for (var i = 0; i <= (lineView.rest ? lineView.rest.length : 0); i++) {
      var line = i ? lineView.rest[i - 1] : lineView.line, order;
      builder.pos = 0;
      builder.addToken = buildToken;
      // Optionally wire in some hacks into the token-rendering
      // algorithm, to deal with browser quirks.
      if (hasBadBidiRects(cm.display.measure) && (order = getOrder(line)))
        builder.addToken = buildTokenBadBidi(builder.addToken, order);
      builder.map = [];
      var allowFrontierUpdate = lineView != cm.display.externalMeasured && lineNo(line);
      insertLineContent(line, builder, getLineStyles(cm, line, allowFrontierUpdate));
      if (line.styleClasses) {
        if (line.styleClasses.bgClass)
          builder.bgClass = joinClasses(line.styleClasses.bgClass, builder.bgClass || "");
        if (line.styleClasses.textClass)
          builder.textClass = joinClasses(line.styleClasses.textClass, builder.textClass || "");
      }

      // Ensure at least a single node is present, for measuring.
      if (builder.map.length == 0)
        builder.map.push(0, 0, builder.content.appendChild(zeroWidthElement(cm.display.measure)));

      // Store the map and a cache object for the current logical line
      if (i == 0) {
        lineView.measure.map = builder.map;
        lineView.measure.cache = {};
      } else {
        (lineView.measure.maps || (lineView.measure.maps = [])).push(builder.map);
        (lineView.measure.caches || (lineView.measure.caches = [])).push({});
      }
    }

    // See issue #2901
    if (webkit && /\bcm-tab\b/.test(builder.content.lastChild.className))
      builder.content.className = "cm-tab-wrap-hack";

    signal(cm, "renderLine", cm, lineView.line, builder.pre);
    if (builder.pre.className)
      builder.textClass = joinClasses(builder.pre.className, builder.textClass || "");

    return builder;
  }

  function defaultSpecialCharPlaceholder(ch) {
    var token = elt("span", "\u2022", "cm-invalidchar");
    token.title = "\\u" + ch.charCodeAt(0).toString(16);
    token.setAttribute("aria-label", token.title);
    return token;
  }

  // Build up the DOM representation for a single token, and add it to
  // the line map. Takes care to render special characters separately.
  function buildToken(builder, text, style, startStyle, endStyle, title, css) {
    if (!text) return;
    var displayText = builder.splitSpaces ? text.replace(/ {3,}/g, splitSpaces) : text;
    var special = builder.cm.state.specialChars, mustWrap = false;
    if (!special.test(text)) {
      builder.col += text.length;
      var content = document.createTextNode(displayText);
      builder.map.push(builder.pos, builder.pos + text.length, content);
      if (ie && ie_version < 9) mustWrap = true;
      builder.pos += text.length;
    } else {
      var content = document.createDocumentFragment(), pos = 0;
      while (true) {
        special.lastIndex = pos;
        var m = special.exec(text);
        var skipped = m ? m.index - pos : text.length - pos;
        if (skipped) {
          var txt = document.createTextNode(displayText.slice(pos, pos + skipped));
          if (ie && ie_version < 9) content.appendChild(elt("span", [txt]));
          else content.appendChild(txt);
          builder.map.push(builder.pos, builder.pos + skipped, txt);
          builder.col += skipped;
          builder.pos += skipped;
        }
        if (!m) break;
        pos += skipped + 1;
        if (m[0] == "\t") {
          var tabSize = builder.cm.options.tabSize, tabWidth = tabSize - builder.col % tabSize;
          var txt = content.appendChild(elt("span", spaceStr(tabWidth), "cm-tab"));
          txt.setAttribute("role", "presentation");
          txt.setAttribute("cm-text", "\t");
          builder.col += tabWidth;
        } else if (m[0] == "\r" || m[0] == "\n") {
          var txt = content.appendChild(elt("span", m[0] == "\r" ? "\u240d" : "\u2424", "cm-invalidchar"));
          txt.setAttribute("cm-text", m[0]);
          builder.col += 1;
        } else {
          var txt = builder.cm.options.specialCharPlaceholder(m[0]);
          txt.setAttribute("cm-text", m[0]);
          if (ie && ie_version < 9) content.appendChild(elt("span", [txt]));
          else content.appendChild(txt);
          builder.col += 1;
        }
        builder.map.push(builder.pos, builder.pos + 1, txt);
        builder.pos++;
      }
    }
    if (style || startStyle || endStyle || mustWrap || css) {
      var fullStyle = style || "";
      if (startStyle) fullStyle += startStyle;
      if (endStyle) fullStyle += endStyle;
      var token = elt("span", [content], fullStyle, css);
      if (title) token.title = title;
      return builder.content.appendChild(token);
    }
    builder.content.appendChild(content);
  }

  function splitSpaces(old) {
    var out = " ";
    for (var i = 0; i < old.length - 2; ++i) out += i % 2 ? " " : "\u00a0";
    out += " ";
    return out;
  }

  // Work around nonsense dimensions being reported for stretches of
  // right-to-left text.
  function buildTokenBadBidi(inner, order) {
    return function(builder, text, style, startStyle, endStyle, title, css) {
      style = style ? style + " cm-force-border" : "cm-force-border";
      var start = builder.pos, end = start + text.length;
      for (;;) {
        // Find the part that overlaps with the start of this text
        for (var i = 0; i < order.length; i++) {
          var part = order[i];
          if (part.to > start && part.from <= start) break;
        }
        if (part.to >= end) return inner(builder, text, style, startStyle, endStyle, title, css);
        inner(builder, text.slice(0, part.to - start), style, startStyle, null, title, css);
        startStyle = null;
        text = text.slice(part.to - start);
        start = part.to;
      }
    };
  }

  function buildCollapsedSpan(builder, size, marker, ignoreWidget) {
    var widget = !ignoreWidget && marker.widgetNode;
    if (widget) builder.map.push(builder.pos, builder.pos + size, widget);
    if (!ignoreWidget && builder.cm.display.input.needsContentAttribute) {
      if (!widget)
        widget = builder.content.appendChild(document.createElement("span"));
      widget.setAttribute("cm-marker", marker.id);
    }
    if (widget) {
      builder.cm.display.input.setUneditable(widget);
      builder.content.appendChild(widget);
    }
    builder.pos += size;
  }

  // Outputs a number of spans to make up a line, taking highlighting
  // and marked text into account.
  function insertLineContent(line, builder, styles) {
    var spans = line.markedSpans, allText = line.text, at = 0;
    if (!spans) {
      for (var i = 1; i < styles.length; i+=2)
        builder.addToken(builder, allText.slice(at, at = styles[i]), interpretTokenStyle(styles[i+1], builder.cm.options));
      return;
    }

    var len = allText.length, pos = 0, i = 1, text = "", style, css;
    var nextChange = 0, spanStyle, spanEndStyle, spanStartStyle, title, collapsed;
    for (;;) {
      if (nextChange == pos) { // Update current marker set
        spanStyle = spanEndStyle = spanStartStyle = title = css = "";
        collapsed = null; nextChange = Infinity;
        var foundBookmarks = [];
        for (var j = 0; j < spans.length; ++j) {
          var sp = spans[j], m = sp.marker;
          if (m.type == "bookmark" && sp.from == pos && m.widgetNode) {
            foundBookmarks.push(m);
          } else if (sp.from <= pos && (sp.to == null || sp.to > pos || m.collapsed && sp.to == pos && sp.from == pos)) {
            if (sp.to != null && sp.to != pos && nextChange > sp.to) {
              nextChange = sp.to;
              spanEndStyle = "";
            }
            if (m.className) spanStyle += " " + m.className;
            if (m.css) css = (css ? css + ";" : "") + m.css;
            if (m.startStyle && sp.from == pos) spanStartStyle += " " + m.startStyle;
            if (m.endStyle && sp.to == nextChange) spanEndStyle += " " + m.endStyle;
            if (m.title && !title) title = m.title;
            if (m.collapsed && (!collapsed || compareCollapsedMarkers(collapsed.marker, m) < 0))
              collapsed = sp;
          } else if (sp.from > pos && nextChange > sp.from) {
            nextChange = sp.from;
          }
        }
        if (collapsed && (collapsed.from || 0) == pos) {
          buildCollapsedSpan(builder, (collapsed.to == null ? len + 1 : collapsed.to) - pos,
                             collapsed.marker, collapsed.from == null);
          if (collapsed.to == null) return;
          if (collapsed.to == pos) collapsed = false;
        }
        if (!collapsed && foundBookmarks.length) for (var j = 0; j < foundBookmarks.length; ++j)
          buildCollapsedSpan(builder, 0, foundBookmarks[j]);
      }
      if (pos >= len) break;

      var upto = Math.min(len, nextChange);
      while (true) {
        if (text) {
          var end = pos + text.length;
          if (!collapsed) {
            var tokenText = end > upto ? text.slice(0, upto - pos) : text;
            builder.addToken(builder, tokenText, style ? style + spanStyle : spanStyle,
                             spanStartStyle, pos + tokenText.length == nextChange ? spanEndStyle : "", title, css);
          }
          if (end >= upto) {text = text.slice(upto - pos); pos = upto; break;}
          pos = end;
          spanStartStyle = "";
        }
        text = allText.slice(at, at = styles[i++]);
        style = interpretTokenStyle(styles[i++], builder.cm.options);
      }
    }
  }

  // DOCUMENT DATA STRUCTURE

  // By default, updates that start and end at the beginning of a line
  // are treated specially, in order to make the association of line
  // widgets and marker elements with the text behave more intuitive.
  function isWholeLineUpdate(doc, change) {
    return change.from.ch == 0 && change.to.ch == 0 && lst(change.text) == "" &&
      (!doc.cm || doc.cm.options.wholeLineUpdateBefore);
  }

  // Perform a change on the document data structure.
  function updateDoc(doc, change, markedSpans, estimateHeight) {
    function spansFor(n) {return markedSpans ? markedSpans[n] : null;}
    function update(line, text, spans) {
      updateLine(line, text, spans, estimateHeight);
      signalLater(line, "change", line, change);
    }
    function linesFor(start, end) {
      for (var i = start, result = []; i < end; ++i)
        result.push(new Line(text[i], spansFor(i), estimateHeight));
      return result;
    }

    var from = change.from, to = change.to, text = change.text;
    var firstLine = getLine(doc, from.line), lastLine = getLine(doc, to.line);
    var lastText = lst(text), lastSpans = spansFor(text.length - 1), nlines = to.line - from.line;

    // Adjust the line structure
    if (change.full) {
      doc.insert(0, linesFor(0, text.length));
      doc.remove(text.length, doc.size - text.length);
    } else if (isWholeLineUpdate(doc, change)) {
      // This is a whole-line replace. Treated specially to make
      // sure line objects move the way they are supposed to.
      var added = linesFor(0, text.length - 1);
      update(lastLine, lastLine.text, lastSpans);
      if (nlines) doc.remove(from.line, nlines);
      if (added.length) doc.insert(from.line, added);
    } else if (firstLine == lastLine) {
      if (text.length == 1) {
        update(firstLine, firstLine.text.slice(0, from.ch) + lastText + firstLine.text.slice(to.ch), lastSpans);
      } else {
        var added = linesFor(1, text.length - 1);
        added.push(new Line(lastText + firstLine.text.slice(to.ch), lastSpans, estimateHeight));
        update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
        doc.insert(from.line + 1, added);
      }
    } else if (text.length == 1) {
      update(firstLine, firstLine.text.slice(0, from.ch) + text[0] + lastLine.text.slice(to.ch), spansFor(0));
      doc.remove(from.line + 1, nlines);
    } else {
      update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
      update(lastLine, lastText + lastLine.text.slice(to.ch), lastSpans);
      var added = linesFor(1, text.length - 1);
      if (nlines > 1) doc.remove(from.line + 1, nlines - 1);
      doc.insert(from.line + 1, added);
    }

    signalLater(doc, "change", doc, change);
  }

  // The document is represented as a BTree consisting of leaves, with
  // chunk of lines in them, and branches, with up to ten leaves or
  // other branch nodes below them. The top node is always a branch
  // node, and is the document object itself (meaning it has
  // additional methods and properties).
  //
  // All nodes have parent links. The tree is used both to go from
  // line numbers to line objects, and to go from objects to numbers.
  // It also indexes by height, and is used to convert between height
  // and line object, and to find the total height of the document.
  //
  // See also http://marijnhaverbeke.nl/blog/codemirror-line-tree.html

  function LeafChunk(lines) {
    this.lines = lines;
    this.parent = null;
    for (var i = 0, height = 0; i < lines.length; ++i) {
      lines[i].parent = this;
      height += lines[i].height;
    }
    this.height = height;
  }

  LeafChunk.prototype = {
    chunkSize: function() { return this.lines.length; },
    // Remove the n lines at offset 'at'.
    removeInner: function(at, n) {
      for (var i = at, e = at + n; i < e; ++i) {
        var line = this.lines[i];
        this.height -= line.height;
        cleanUpLine(line);
        signalLater(line, "delete");
      }
      this.lines.splice(at, n);
    },
    // Helper used to collapse a small branch into a single leaf.
    collapse: function(lines) {
      lines.push.apply(lines, this.lines);
    },
    // Insert the given array of lines at offset 'at', count them as
    // having the given height.
    insertInner: function(at, lines, height) {
      this.height += height;
      this.lines = this.lines.slice(0, at).concat(lines).concat(this.lines.slice(at));
      for (var i = 0; i < lines.length; ++i) lines[i].parent = this;
    },
    // Used to iterate over a part of the tree.
    iterN: function(at, n, op) {
      for (var e = at + n; at < e; ++at)
        if (op(this.lines[at])) return true;
    }
  };

  function BranchChunk(children) {
    this.children = children;
    var size = 0, height = 0;
    for (var i = 0; i < children.length; ++i) {
      var ch = children[i];
      size += ch.chunkSize(); height += ch.height;
      ch.parent = this;
    }
    this.size = size;
    this.height = height;
    this.parent = null;
  }

  BranchChunk.prototype = {
    chunkSize: function() { return this.size; },
    removeInner: function(at, n) {
      this.size -= n;
      for (var i = 0; i < this.children.length; ++i) {
        var child = this.children[i], sz = child.chunkSize();
        if (at < sz) {
          var rm = Math.min(n, sz - at), oldHeight = child.height;
          child.removeInner(at, rm);
          this.height -= oldHeight - child.height;
          if (sz == rm) { this.children.splice(i--, 1); child.parent = null; }
          if ((n -= rm) == 0) break;
          at = 0;
        } else at -= sz;
      }
      // If the result is smaller than 25 lines, ensure that it is a
      // single leaf node.
      if (this.size - n < 25 &&
          (this.children.length > 1 || !(this.children[0] instanceof LeafChunk))) {
        var lines = [];
        this.collapse(lines);
        this.children = [new LeafChunk(lines)];
        this.children[0].parent = this;
      }
    },
    collapse: function(lines) {
      for (var i = 0; i < this.children.length; ++i) this.children[i].collapse(lines);
    },
    insertInner: function(at, lines, height) {
      this.size += lines.length;
      this.height += height;
      for (var i = 0; i < this.children.length; ++i) {
        var child = this.children[i], sz = child.chunkSize();
        if (at <= sz) {
          child.insertInner(at, lines, height);
          if (child.lines && child.lines.length > 50) {
            while (child.lines.length > 50) {
              var spilled = child.lines.splice(child.lines.length - 25, 25);
              var newleaf = new LeafChunk(spilled);
              child.height -= newleaf.height;
              this.children.splice(i + 1, 0, newleaf);
              newleaf.parent = this;
            }
            this.maybeSpill();
          }
          break;
        }
        at -= sz;
      }
    },
    // When a node has grown, check whether it should be split.
    maybeSpill: function() {
      if (this.children.length <= 10) return;
      var me = this;
      do {
        var spilled = me.children.splice(me.children.length - 5, 5);
        var sibling = new BranchChunk(spilled);
        if (!me.parent) { // Become the parent node
          var copy = new BranchChunk(me.children);
          copy.parent = me;
          me.children = [copy, sibling];
          me = copy;
        } else {
          me.size -= sibling.size;
          me.height -= sibling.height;
          var myIndex = indexOf(me.parent.children, me);
          me.parent.children.splice(myIndex + 1, 0, sibling);
        }
        sibling.parent = me.parent;
      } while (me.children.length > 10);
      me.parent.maybeSpill();
    },
    iterN: function(at, n, op) {
      for (var i = 0; i < this.children.length; ++i) {
        var child = this.children[i], sz = child.chunkSize();
        if (at < sz) {
          var used = Math.min(n, sz - at);
          if (child.iterN(at, used, op)) return true;
          if ((n -= used) == 0) break;
          at = 0;
        } else at -= sz;
      }
    }
  };

  var nextDocId = 0;
  var Doc = CodeMirror.Doc = function(text, mode, firstLine, lineSep) {
    if (!(this instanceof Doc)) return new Doc(text, mode, firstLine, lineSep);
    if (firstLine == null) firstLine = 0;

    BranchChunk.call(this, [new LeafChunk([new Line("", null)])]);
    this.first = firstLine;
    this.scrollTop = this.scrollLeft = 0;
    this.cantEdit = false;
    this.cleanGeneration = 1;
    this.frontier = firstLine;
    var start = Pos(firstLine, 0);
    this.sel = simpleSelection(start);
    this.history = new History(null);
    this.id = ++nextDocId;
    this.modeOption = mode;
    this.lineSep = lineSep;
    this.extend = false;

    if (typeof text == "string") text = this.splitLines(text);
    updateDoc(this, {from: start, to: start, text: text});
    setSelection(this, simpleSelection(start), sel_dontScroll);
  };

  Doc.prototype = createObj(BranchChunk.prototype, {
    constructor: Doc,
    // Iterate over the document. Supports two forms -- with only one
    // argument, it calls that for each line in the document. With
    // three, it iterates over the range given by the first two (with
    // the second being non-inclusive).
    iter: function(from, to, op) {
      if (op) this.iterN(from - this.first, to - from, op);
      else this.iterN(this.first, this.first + this.size, from);
    },

    // Non-public interface for adding and removing lines.
    insert: function(at, lines) {
      var height = 0;
      for (var i = 0; i < lines.length; ++i) height += lines[i].height;
      this.insertInner(at - this.first, lines, height);
    },
    remove: function(at, n) { this.removeInner(at - this.first, n); },

    // From here, the methods are part of the public interface. Most
    // are also available from CodeMirror (editor) instances.

    getValue: function(lineSep) {
      var lines = getLines(this, this.first, this.first + this.size);
      if (lineSep === false) return lines;
      return lines.join(lineSep || this.lineSeparator());
    },
    setValue: docMethodOp(function(code) {
      var top = Pos(this.first, 0), last = this.first + this.size - 1;
      makeChange(this, {from: top, to: Pos(last, getLine(this, last).text.length),
                        text: this.splitLines(code), origin: "setValue", full: true}, true);
      setSelection(this, simpleSelection(top));
    }),
    replaceRange: function(code, from, to, origin) {
      from = clipPos(this, from);
      to = to ? clipPos(this, to) : from;
      replaceRange(this, code, from, to, origin);
    },
    getRange: function(from, to, lineSep) {
      var lines = getBetween(this, clipPos(this, from), clipPos(this, to));
      if (lineSep === false) return lines;
      return lines.join(lineSep || this.lineSeparator());
    },

    getLine: function(line) {var l = this.getLineHandle(line); return l && l.text;},

    getLineHandle: function(line) {if (isLine(this, line)) return getLine(this, line);},
    getLineNumber: function(line) {return lineNo(line);},

    getLineHandleVisualStart: function(line) {
      if (typeof line == "number") line = getLine(this, line);
      return visualLine(line);
    },

    lineCount: function() {return this.size;},
    firstLine: function() {return this.first;},
    lastLine: function() {return this.first + this.size - 1;},

    clipPos: function(pos) {return clipPos(this, pos);},

    getCursor: function(start) {
      var range = this.sel.primary(), pos;
      if (start == null || start == "head") pos = range.head;
      else if (start == "anchor") pos = range.anchor;
      else if (start == "end" || start == "to" || start === false) pos = range.to();
      else pos = range.from();
      return pos;
    },
    listSelections: function() { return this.sel.ranges; },
    somethingSelected: function() {return this.sel.somethingSelected();},

    setCursor: docMethodOp(function(line, ch, options) {
      setSimpleSelection(this, clipPos(this, typeof line == "number" ? Pos(line, ch || 0) : line), null, options);
    }),
    setSelection: docMethodOp(function(anchor, head, options) {
      setSimpleSelection(this, clipPos(this, anchor), clipPos(this, head || anchor), options);
    }),
    extendSelection: docMethodOp(function(head, other, options) {
      extendSelection(this, clipPos(this, head), other && clipPos(this, other), options);
    }),
    extendSelections: docMethodOp(function(heads, options) {
      extendSelections(this, clipPosArray(this, heads, options));
    }),
    extendSelectionsBy: docMethodOp(function(f, options) {
      extendSelections(this, map(this.sel.ranges, f), options);
    }),
    setSelections: docMethodOp(function(ranges, primary, options) {
      if (!ranges.length) return;
      for (var i = 0, out = []; i < ranges.length; i++)
        out[i] = new Range(clipPos(this, ranges[i].anchor),
                           clipPos(this, ranges[i].head));
      if (primary == null) primary = Math.min(ranges.length - 1, this.sel.primIndex);
      setSelection(this, normalizeSelection(out, primary), options);
    }),
    addSelection: docMethodOp(function(anchor, head, options) {
      var ranges = this.sel.ranges.slice(0);
      ranges.push(new Range(clipPos(this, anchor), clipPos(this, head || anchor)));
      setSelection(this, normalizeSelection(ranges, ranges.length - 1), options);
    }),

    getSelection: function(lineSep) {
      var ranges = this.sel.ranges, lines;
      for (var i = 0; i < ranges.length; i++) {
        var sel = getBetween(this, ranges[i].from(), ranges[i].to());
        lines = lines ? lines.concat(sel) : sel;
      }
      if (lineSep === false) return lines;
      else return lines.join(lineSep || this.lineSeparator());
    },
    getSelections: function(lineSep) {
      var parts = [], ranges = this.sel.ranges;
      for (var i = 0; i < ranges.length; i++) {
        var sel = getBetween(this, ranges[i].from(), ranges[i].to());
        if (lineSep !== false) sel = sel.join(lineSep || this.lineSeparator());
        parts[i] = sel;
      }
      return parts;
    },
    replaceSelection: function(code, collapse, origin) {
      var dup = [];
      for (var i = 0; i < this.sel.ranges.length; i++)
        dup[i] = code;
      this.replaceSelections(dup, collapse, origin || "+input");
    },
    replaceSelections: docMethodOp(function(code, collapse, origin) {
      var changes = [], sel = this.sel;
      for (var i = 0; i < sel.ranges.length; i++) {
        var range = sel.ranges[i];
        changes[i] = {from: range.from(), to: range.to(), text: this.splitLines(code[i]), origin: origin};
      }
      var newSel = collapse && collapse != "end" && computeReplacedSel(this, changes, collapse);
      for (var i = changes.length - 1; i >= 0; i--)
        makeChange(this, changes[i]);
      if (newSel) setSelectionReplaceHistory(this, newSel);
      else if (this.cm) ensureCursorVisible(this.cm);
    }),
    undo: docMethodOp(function() {makeChangeFromHistory(this, "undo");}),
    redo: docMethodOp(function() {makeChangeFromHistory(this, "redo");}),
    undoSelection: docMethodOp(function() {makeChangeFromHistory(this, "undo", true);}),
    redoSelection: docMethodOp(function() {makeChangeFromHistory(this, "redo", true);}),

    setExtending: function(val) {this.extend = val;},
    getExtending: function() {return this.extend;},

    historySize: function() {
      var hist = this.history, done = 0, undone = 0;
      for (var i = 0; i < hist.done.length; i++) if (!hist.done[i].ranges) ++done;
      for (var i = 0; i < hist.undone.length; i++) if (!hist.undone[i].ranges) ++undone;
      return {undo: done, redo: undone};
    },
    clearHistory: function() {this.history = new History(this.history.maxGeneration);},

    markClean: function() {
      this.cleanGeneration = this.changeGeneration(true);
    },
    changeGeneration: function(forceSplit) {
      if (forceSplit)
        this.history.lastOp = this.history.lastSelOp = this.history.lastOrigin = null;
      return this.history.generation;
    },
    isClean: function (gen) {
      return this.history.generation == (gen || this.cleanGeneration);
    },

    getHistory: function() {
      return {done: copyHistoryArray(this.history.done),
              undone: copyHistoryArray(this.history.undone)};
    },
    setHistory: function(histData) {
      var hist = this.history = new History(this.history.maxGeneration);
      hist.done = copyHistoryArray(histData.done.slice(0), null, true);
      hist.undone = copyHistoryArray(histData.undone.slice(0), null, true);
    },

    addLineClass: docMethodOp(function(handle, where, cls) {
      return changeLine(this, handle, where == "gutter" ? "gutter" : "class", function(line) {
        var prop = where == "text" ? "textClass"
                 : where == "background" ? "bgClass"
                 : where == "gutter" ? "gutterClass" : "wrapClass";
        if (!line[prop]) line[prop] = cls;
        else if (classTest(cls).test(line[prop])) return false;
        else line[prop] += " " + cls;
        return true;
      });
    }),
    removeLineClass: docMethodOp(function(handle, where, cls) {
      return changeLine(this, handle, where == "gutter" ? "gutter" : "class", function(line) {
        var prop = where == "text" ? "textClass"
                 : where == "background" ? "bgClass"
                 : where == "gutter" ? "gutterClass" : "wrapClass";
        var cur = line[prop];
        if (!cur) return false;
        else if (cls == null) line[prop] = null;
        else {
          var found = cur.match(classTest(cls));
          if (!found) return false;
          var end = found.index + found[0].length;
          line[prop] = cur.slice(0, found.index) + (!found.index || end == cur.length ? "" : " ") + cur.slice(end) || null;
        }
        return true;
      });
    }),

    addLineWidget: docMethodOp(function(handle, node, options) {
      return addLineWidget(this, handle, node, options);
    }),
    removeLineWidget: function(widget) { widget.clear(); },

    markText: function(from, to, options) {
      return markText(this, clipPos(this, from), clipPos(this, to), options, options && options.type || "range");
    },
    setBookmark: function(pos, options) {
      var realOpts = {replacedWith: options && (options.nodeType == null ? options.widget : options),
                      insertLeft: options && options.insertLeft,
                      clearWhenEmpty: false, shared: options && options.shared,
                      handleMouseEvents: options && options.handleMouseEvents};
      pos = clipPos(this, pos);
      return markText(this, pos, pos, realOpts, "bookmark");
    },
    findMarksAt: function(pos) {
      pos = clipPos(this, pos);
      var markers = [], spans = getLine(this, pos.line).markedSpans;
      if (spans) for (var i = 0; i < spans.length; ++i) {
        var span = spans[i];
        if ((span.from == null || span.from <= pos.ch) &&
            (span.to == null || span.to >= pos.ch))
          markers.push(span.marker.parent || span.marker);
      }
      return markers;
    },
    findMarks: function(from, to, filter) {
      from = clipPos(this, from); to = clipPos(this, to);
      var found = [], lineNo = from.line;
      this.iter(from.line, to.line + 1, function(line) {
        var spans = line.markedSpans;
        if (spans) for (var i = 0; i < spans.length; i++) {
          var span = spans[i];
          if (!(lineNo == from.line && from.ch > span.to ||
                span.from == null && lineNo != from.line||
                lineNo == to.line && span.from > to.ch) &&
              (!filter || filter(span.marker)))
            found.push(span.marker.parent || span.marker);
        }
        ++lineNo;
      });
      return found;
    },
    getAllMarks: function() {
      var markers = [];
      this.iter(function(line) {
        var sps = line.markedSpans;
        if (sps) for (var i = 0; i < sps.length; ++i)
          if (sps[i].from != null) markers.push(sps[i].marker);
      });
      return markers;
    },

    posFromIndex: function(off) {
      var ch, lineNo = this.first;
      this.iter(function(line) {
        var sz = line.text.length + 1;
        if (sz > off) { ch = off; return true; }
        off -= sz;
        ++lineNo;
      });
      return clipPos(this, Pos(lineNo, ch));
    },
    indexFromPos: function (coords) {
      coords = clipPos(this, coords);
      var index = coords.ch;
      if (coords.line < this.first || coords.ch < 0) return 0;
      this.iter(this.first, coords.line, function (line) {
        index += line.text.length + 1;
      });
      return index;
    },

    copy: function(copyHistory) {
      var doc = new Doc(getLines(this, this.first, this.first + this.size),
                        this.modeOption, this.first, this.lineSep);
      doc.scrollTop = this.scrollTop; doc.scrollLeft = this.scrollLeft;
      doc.sel = this.sel;
      doc.extend = false;
      if (copyHistory) {
        doc.history.undoDepth = this.history.undoDepth;
        doc.setHistory(this.getHistory());
      }
      return doc;
    },

    linkedDoc: function(options) {
      if (!options) options = {};
      var from = this.first, to = this.first + this.size;
      if (options.from != null && options.from > from) from = options.from;
      if (options.to != null && options.to < to) to = options.to;
      var copy = new Doc(getLines(this, from, to), options.mode || this.modeOption, from, this.lineSep);
      if (options.sharedHist) copy.history = this.history;
      (this.linked || (this.linked = [])).push({doc: copy, sharedHist: options.sharedHist});
      copy.linked = [{doc: this, isParent: true, sharedHist: options.sharedHist}];
      copySharedMarkers(copy, findSharedMarkers(this));
      return copy;
    },
    unlinkDoc: function(other) {
      if (other instanceof CodeMirror) other = other.doc;
      if (this.linked) for (var i = 0; i < this.linked.length; ++i) {
        var link = this.linked[i];
        if (link.doc != other) continue;
        this.linked.splice(i, 1);
        other.unlinkDoc(this);
        detachSharedMarkers(findSharedMarkers(this));
        break;
      }
      // If the histories were shared, split them again
      if (other.history == this.history) {
        var splitIds = [other.id];
        linkedDocs(other, function(doc) {splitIds.push(doc.id);}, true);
        other.history = new History(null);
        other.history.done = copyHistoryArray(this.history.done, splitIds);
        other.history.undone = copyHistoryArray(this.history.undone, splitIds);
      }
    },
    iterLinkedDocs: function(f) {linkedDocs(this, f);},

    getMode: function() {return this.mode;},
    getEditor: function() {return this.cm;},

    splitLines: function(str) {
      if (this.lineSep) return str.split(this.lineSep);
      return splitLinesAuto(str);
    },
    lineSeparator: function() { return this.lineSep || "\n"; }
  });

  // Public alias.
  Doc.prototype.eachLine = Doc.prototype.iter;

  // Set up methods on CodeMirror's prototype to redirect to the editor's document.
  var dontDelegate = "iter insert remove copy getEditor constructor".split(" ");
  for (var prop in Doc.prototype) if (Doc.prototype.hasOwnProperty(prop) && indexOf(dontDelegate, prop) < 0)
    CodeMirror.prototype[prop] = (function(method) {
      return function() {return method.apply(this.doc, arguments);};
    })(Doc.prototype[prop]);

  eventMixin(Doc);

  // Call f for all linked documents.
  function linkedDocs(doc, f, sharedHistOnly) {
    function propagate(doc, skip, sharedHist) {
      if (doc.linked) for (var i = 0; i < doc.linked.length; ++i) {
        var rel = doc.linked[i];
        if (rel.doc == skip) continue;
        var shared = sharedHist && rel.sharedHist;
        if (sharedHistOnly && !shared) continue;
        f(rel.doc, shared);
        propagate(rel.doc, doc, shared);
      }
    }
    propagate(doc, null, true);
  }

  // Attach a document to an editor.
  function attachDoc(cm, doc) {
    if (doc.cm) throw new Error("This document is already in use.");
    cm.doc = doc;
    doc.cm = cm;
    estimateLineHeights(cm);
    loadMode(cm);
    if (!cm.options.lineWrapping) findMaxLine(cm);
    cm.options.mode = doc.modeOption;
    regChange(cm);
  }

  // LINE UTILITIES

  // Find the line object corresponding to the given line number.
  function getLine(doc, n) {
    n -= doc.first;
    if (n < 0 || n >= doc.size) throw new Error("There is no line " + (n + doc.first) + " in the document.");
    for (var chunk = doc; !chunk.lines;) {
      for (var i = 0;; ++i) {
        var child = chunk.children[i], sz = child.chunkSize();
        if (n < sz) { chunk = child; break; }
        n -= sz;
      }
    }
    return chunk.lines[n];
  }

  // Get the part of a document between two positions, as an array of
  // strings.
  function getBetween(doc, start, end) {
    var out = [], n = start.line;
    doc.iter(start.line, end.line + 1, function(line) {
      var text = line.text;
      if (n == end.line) text = text.slice(0, end.ch);
      if (n == start.line) text = text.slice(start.ch);
      out.push(text);
      ++n;
    });
    return out;
  }
  // Get the lines between from and to, as array of strings.
  function getLines(doc, from, to) {
    var out = [];
    doc.iter(from, to, function(line) { out.push(line.text); });
    return out;
  }

  // Update the height of a line, propagating the height change
  // upwards to parent nodes.
  function updateLineHeight(line, height) {
    var diff = height - line.height;
    if (diff) for (var n = line; n; n = n.parent) n.height += diff;
  }

  // Given a line object, find its line number by walking up through
  // its parent links.
  function lineNo(line) {
    if (line.parent == null) return null;
    var cur = line.parent, no = indexOf(cur.lines, line);
    for (var chunk = cur.parent; chunk; cur = chunk, chunk = chunk.parent) {
      for (var i = 0;; ++i) {
        if (chunk.children[i] == cur) break;
        no += chunk.children[i].chunkSize();
      }
    }
    return no + cur.first;
  }

  // Find the line at the given vertical position, using the height
  // information in the document tree.
  function lineAtHeight(chunk, h) {
    var n = chunk.first;
    outer: do {
      for (var i = 0; i < chunk.children.length; ++i) {
        var child = chunk.children[i], ch = child.height;
        if (h < ch) { chunk = child; continue outer; }
        h -= ch;
        n += child.chunkSize();
      }
      return n;
    } while (!chunk.lines);
    for (var i = 0; i < chunk.lines.length; ++i) {
      var line = chunk.lines[i], lh = line.height;
      if (h < lh) break;
      h -= lh;
    }
    return n + i;
  }


  // Find the height above the given line.
  function heightAtLine(lineObj) {
    lineObj = visualLine(lineObj);

    var h = 0, chunk = lineObj.parent;
    for (var i = 0; i < chunk.lines.length; ++i) {
      var line = chunk.lines[i];
      if (line == lineObj) break;
      else h += line.height;
    }
    for (var p = chunk.parent; p; chunk = p, p = chunk.parent) {
      for (var i = 0; i < p.children.length; ++i) {
        var cur = p.children[i];
        if (cur == chunk) break;
        else h += cur.height;
      }
    }
    return h;
  }

  // Get the bidi ordering for the given line (and cache it). Returns
  // false for lines that are fully left-to-right, and an array of
  // BidiSpan objects otherwise.
  function getOrder(line) {
    var order = line.order;
    if (order == null) order = line.order = bidiOrdering(line.text);
    return order;
  }

  // HISTORY

  function History(startGen) {
    // Arrays of change events and selections. Doing something adds an
    // event to done and clears undo. Undoing moves events from done
    // to undone, redoing moves them in the other direction.
    this.done = []; this.undone = [];
    this.undoDepth = Infinity;
    // Used to track when changes can be merged into a single undo
    // event
    this.lastModTime = this.lastSelTime = 0;
    this.lastOp = this.lastSelOp = null;
    this.lastOrigin = this.lastSelOrigin = null;
    // Used by the isClean() method
    this.generation = this.maxGeneration = startGen || 1;
  }

  // Create a history change event from an updateDoc-style change
  // object.
  function historyChangeFromChange(doc, change) {
    var histChange = {from: copyPos(change.from), to: changeEnd(change), text: getBetween(doc, change.from, change.to)};
    attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1);
    linkedDocs(doc, function(doc) {attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1);}, true);
    return histChange;
  }

  // Pop all selection events off the end of a history array. Stop at
  // a change event.
  function clearSelectionEvents(array) {
    while (array.length) {
      var last = lst(array);
      if (last.ranges) array.pop();
      else break;
    }
  }

  // Find the top change event in the history. Pop off selection
  // events that are in the way.
  function lastChangeEvent(hist, force) {
    if (force) {
      clearSelectionEvents(hist.done);
      return lst(hist.done);
    } else if (hist.done.length && !lst(hist.done).ranges) {
      return lst(hist.done);
    } else if (hist.done.length > 1 && !hist.done[hist.done.length - 2].ranges) {
      hist.done.pop();
      return lst(hist.done);
    }
  }

  // Register a change in the history. Merges changes that are within
  // a single operation, ore are close together with an origin that
  // allows merging (starting with "+") into a single event.
  function addChangeToHistory(doc, change, selAfter, opId) {
    var hist = doc.history;
    hist.undone.length = 0;
    var time = +new Date, cur;

    if ((hist.lastOp == opId ||
         hist.lastOrigin == change.origin && change.origin &&
         ((change.origin.charAt(0) == "+" && doc.cm && hist.lastModTime > time - doc.cm.options.historyEventDelay) ||
          change.origin.charAt(0) == "*")) &&
        (cur = lastChangeEvent(hist, hist.lastOp == opId))) {
      // Merge this change into the last event
      var last = lst(cur.changes);
      if (cmp(change.from, change.to) == 0 && cmp(change.from, last.to) == 0) {
        // Optimized case for simple insertion -- don't want to add
        // new changesets for every character typed
        last.to = changeEnd(change);
      } else {
        // Add new sub-event
        cur.changes.push(historyChangeFromChange(doc, change));
      }
    } else {
      // Can not be merged, start a new event.
      var before = lst(hist.done);
      if (!before || !before.ranges)
        pushSelectionToHistory(doc.sel, hist.done);
      cur = {changes: [historyChangeFromChange(doc, change)],
             generation: hist.generation};
      hist.done.push(cur);
      while (hist.done.length > hist.undoDepth) {
        hist.done.shift();
        if (!hist.done[0].ranges) hist.done.shift();
      }
    }
    hist.done.push(selAfter);
    hist.generation = ++hist.maxGeneration;
    hist.lastModTime = hist.lastSelTime = time;
    hist.lastOp = hist.lastSelOp = opId;
    hist.lastOrigin = hist.lastSelOrigin = change.origin;

    if (!last) signal(doc, "historyAdded");
  }

  function selectionEventCanBeMerged(doc, origin, prev, sel) {
    var ch = origin.charAt(0);
    return ch == "*" ||
      ch == "+" &&
      prev.ranges.length == sel.ranges.length &&
      prev.somethingSelected() == sel.somethingSelected() &&
      new Date - doc.history.lastSelTime <= (doc.cm ? doc.cm.options.historyEventDelay : 500);
  }

  // Called whenever the selection changes, sets the new selection as
  // the pending selection in the history, and pushes the old pending
  // selection into the 'done' array when it was significantly
  // different (in number of selected ranges, emptiness, or time).
  function addSelectionToHistory(doc, sel, opId, options) {
    var hist = doc.history, origin = options && options.origin;

    // A new event is started when the previous origin does not match
    // the current, or the origins don't allow matching. Origins
    // starting with * are always merged, those starting with + are
    // merged when similar and close together in time.
    if (opId == hist.lastSelOp ||
        (origin && hist.lastSelOrigin == origin &&
         (hist.lastModTime == hist.lastSelTime && hist.lastOrigin == origin ||
          selectionEventCanBeMerged(doc, origin, lst(hist.done), sel))))
      hist.done[hist.done.length - 1] = sel;
    else
      pushSelectionToHistory(sel, hist.done);

    hist.lastSelTime = +new Date;
    hist.lastSelOrigin = origin;
    hist.lastSelOp = opId;
    if (options && options.clearRedo !== false)
      clearSelectionEvents(hist.undone);
  }

  function pushSelectionToHistory(sel, dest) {
    var top = lst(dest);
    if (!(top && top.ranges && top.equals(sel)))
      dest.push(sel);
  }

  // Used to store marked span information in the history.
  function attachLocalSpans(doc, change, from, to) {
    var existing = change["spans_" + doc.id], n = 0;
    doc.iter(Math.max(doc.first, from), Math.min(doc.first + doc.size, to), function(line) {
      if (line.markedSpans)
        (existing || (existing = change["spans_" + doc.id] = {}))[n] = line.markedSpans;
      ++n;
    });
  }

  // When un/re-doing restores text containing marked spans, those
  // that have been explicitly cleared should not be restored.
  function removeClearedSpans(spans) {
    if (!spans) return null;
    for (var i = 0, out; i < spans.length; ++i) {
      if (spans[i].marker.explicitlyCleared) { if (!out) out = spans.slice(0, i); }
      else if (out) out.push(spans[i]);
    }
    return !out ? spans : out.length ? out : null;
  }

  // Retrieve and filter the old marked spans stored in a change event.
  function getOldSpans(doc, change) {
    var found = change["spans_" + doc.id];
    if (!found) return null;
    for (var i = 0, nw = []; i < change.text.length; ++i)
      nw.push(removeClearedSpans(found[i]));
    return nw;
  }

  // Used both to provide a JSON-safe object in .getHistory, and, when
  // detaching a document, to split the history in two
  function copyHistoryArray(events, newGroup, instantiateSel) {
    for (var i = 0, copy = []; i < events.length; ++i) {
      var event = events[i];
      if (event.ranges) {
        copy.push(instantiateSel ? Selection.prototype.deepCopy.call(event) : event);
        continue;
      }
      var changes = event.changes, newChanges = [];
      copy.push({changes: newChanges});
      for (var j = 0; j < changes.length; ++j) {
        var change = changes[j], m;
        newChanges.push({from: change.from, to: change.to, text: change.text});
        if (newGroup) for (var prop in change) if (m = prop.match(/^spans_(\d+)$/)) {
          if (indexOf(newGroup, Number(m[1])) > -1) {
            lst(newChanges)[prop] = change[prop];
            delete change[prop];
          }
        }
      }
    }
    return copy;
  }

  // Rebasing/resetting history to deal with externally-sourced changes

  function rebaseHistSelSingle(pos, from, to, diff) {
    if (to < pos.line) {
      pos.line += diff;
    } else if (from < pos.line) {
      pos.line = from;
      pos.ch = 0;
    }
  }

  // Tries to rebase an array of history events given a change in the
  // document. If the change touches the same lines as the event, the
  // event, and everything 'behind' it, is discarded. If the change is
  // before the event, the event's positions are updated. Uses a
  // copy-on-write scheme for the positions, to avoid having to
  // reallocate them all on every rebase, but also avoid problems with
  // shared position objects being unsafely updated.
  function rebaseHistArray(array, from, to, diff) {
    for (var i = 0; i < array.length; ++i) {
      var sub = array[i], ok = true;
      if (sub.ranges) {
        if (!sub.copied) { sub = array[i] = sub.deepCopy(); sub.copied = true; }
        for (var j = 0; j < sub.ranges.length; j++) {
          rebaseHistSelSingle(sub.ranges[j].anchor, from, to, diff);
          rebaseHistSelSingle(sub.ranges[j].head, from, to, diff);
        }
        continue;
      }
      for (var j = 0; j < sub.changes.length; ++j) {
        var cur = sub.changes[j];
        if (to < cur.from.line) {
          cur.from = Pos(cur.from.line + diff, cur.from.ch);
          cur.to = Pos(cur.to.line + diff, cur.to.ch);
        } else if (from <= cur.to.line) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        array.splice(0, i + 1);
        i = 0;
      }
    }
  }

  function rebaseHist(hist, change) {
    var from = change.from.line, to = change.to.line, diff = change.text.length - (to - from) - 1;
    rebaseHistArray(hist.done, from, to, diff);
    rebaseHistArray(hist.undone, from, to, diff);
  }

  // EVENT UTILITIES

  // Due to the fact that we still support jurassic IE versions, some
  // compatibility wrappers are needed.

  var e_preventDefault = CodeMirror.e_preventDefault = function(e) {
    if (e.preventDefault) e.preventDefault();
    else e.returnValue = false;
  };
  var e_stopPropagation = CodeMirror.e_stopPropagation = function(e) {
    if (e.stopPropagation) e.stopPropagation();
    else e.cancelBubble = true;
  };
  function e_defaultPrevented(e) {
    return e.defaultPrevented != null ? e.defaultPrevented : e.returnValue == false;
  }
  var e_stop = CodeMirror.e_stop = function(e) {e_preventDefault(e); e_stopPropagation(e);};

  function e_target(e) {return e.target || e.srcElement;}
  function e_button(e) {
    var b = e.which;
    if (b == null) {
      if (e.button & 1) b = 1;
      else if (e.button & 2) b = 3;
      else if (e.button & 4) b = 2;
    }
    if (mac && e.ctrlKey && b == 1) b = 3;
    return b;
  }

  // EVENT HANDLING

  // Lightweight event framework. on/off also work on DOM nodes,
  // registering native DOM handlers.

  var on = CodeMirror.on = function(emitter, type, f) {
    if (emitter.addEventListener)
      emitter.addEventListener(type, f, false);
    else if (emitter.attachEvent)
      emitter.attachEvent("on" + type, f);
    else {
      var map = emitter._handlers || (emitter._handlers = {});
      var arr = map[type] || (map[type] = []);
      arr.push(f);
    }
  };

  var noHandlers = []
  function getHandlers(emitter, type, copy) {
    var arr = emitter._handlers && emitter._handlers[type]
    if (copy) return arr && arr.length > 0 ? arr.slice() : noHandlers
    else return arr || noHandlers
  }

  var off = CodeMirror.off = function(emitter, type, f) {
    if (emitter.removeEventListener)
      emitter.removeEventListener(type, f, false);
    else if (emitter.detachEvent)
      emitter.detachEvent("on" + type, f);
    else {
      var handlers = getHandlers(emitter, type, false)
      for (var i = 0; i < handlers.length; ++i)
        if (handlers[i] == f) { handlers.splice(i, 1); break; }
    }
  };

  var signal = CodeMirror.signal = function(emitter, type /*, values...*/) {
    var handlers = getHandlers(emitter, type, true)
    if (!handlers.length) return;
    var args = Array.prototype.slice.call(arguments, 2);
    for (var i = 0; i < handlers.length; ++i) handlers[i].apply(null, args);
  };

  var orphanDelayedCallbacks = null;

  // Often, we want to signal events at a point where we are in the
  // middle of some work, but don't want the handler to start calling
  // other methods on the editor, which might be in an inconsistent
  // state or simply not expect any other events to happen.
  // signalLater looks whether there are any handlers, and schedules
  // them to be executed when the last operation ends, or, if no
  // operation is active, when a timeout fires.
  function signalLater(emitter, type /*, values...*/) {
    var arr = getHandlers(emitter, type, false)
    if (!arr.length) return;
    var args = Array.prototype.slice.call(arguments, 2), list;
    if (operationGroup) {
      list = operationGroup.delayedCallbacks;
    } else if (orphanDelayedCallbacks) {
      list = orphanDelayedCallbacks;
    } else {
      list = orphanDelayedCallbacks = [];
      setTimeout(fireOrphanDelayed, 0);
    }
    function bnd(f) {return function(){f.apply(null, args);};};
    for (var i = 0; i < arr.length; ++i)
      list.push(bnd(arr[i]));
  }

  function fireOrphanDelayed() {
    var delayed = orphanDelayedCallbacks;
    orphanDelayedCallbacks = null;
    for (var i = 0; i < delayed.length; ++i) delayed[i]();
  }

  // The DOM events that CodeMirror handles can be overridden by
  // registering a (non-DOM) handler on the editor for the event name,
  // and preventDefault-ing the event in that handler.
  function signalDOMEvent(cm, e, override) {
    if (typeof e == "string")
      e = {type: e, preventDefault: function() { this.defaultPrevented = true; }};
    signal(cm, override || e.type, cm, e);
    return e_defaultPrevented(e) || e.codemirrorIgnore;
  }

  function signalCursorActivity(cm) {
    var arr = cm._handlers && cm._handlers.cursorActivity;
    if (!arr) return;
    var set = cm.curOp.cursorActivityHandlers || (cm.curOp.cursorActivityHandlers = []);
    for (var i = 0; i < arr.length; ++i) if (indexOf(set, arr[i]) == -1)
      set.push(arr[i]);
  }

  function hasHandler(emitter, type) {
    return getHandlers(emitter, type).length > 0
  }

  // Add on and off methods to a constructor's prototype, to make
  // registering events on such objects more convenient.
  function eventMixin(ctor) {
    ctor.prototype.on = function(type, f) {on(this, type, f);};
    ctor.prototype.off = function(type, f) {off(this, type, f);};
  }

  // MISC UTILITIES

  // Number of pixels added to scroller and sizer to hide scrollbar
  var scrollerGap = 30;

  // Returned or thrown by various protocols to signal 'I'm not
  // handling this'.
  var Pass = CodeMirror.Pass = {toString: function(){return "CodeMirror.Pass";}};

  // Reused option objects for setSelection & friends
  var sel_dontScroll = {scroll: false}, sel_mouse = {origin: "*mouse"}, sel_move = {origin: "+move"};

  function Delayed() {this.id = null;}
  Delayed.prototype.set = function(ms, f) {
    clearTimeout(this.id);
    this.id = setTimeout(f, ms);
  };

  // Counts the column offset in a string, taking tabs into account.
  // Used mostly to find indentation.
  var countColumn = CodeMirror.countColumn = function(string, end, tabSize, startIndex, startValue) {
    if (end == null) {
      end = string.search(/[^\s\u00a0]/);
      if (end == -1) end = string.length;
    }
    for (var i = startIndex || 0, n = startValue || 0;;) {
      var nextTab = string.indexOf("\t", i);
      if (nextTab < 0 || nextTab >= end)
        return n + (end - i);
      n += nextTab - i;
      n += tabSize - (n % tabSize);
      i = nextTab + 1;
    }
  };

  // The inverse of countColumn -- find the offset that corresponds to
  // a particular column.
  var findColumn = CodeMirror.findColumn = function(string, goal, tabSize) {
    for (var pos = 0, col = 0;;) {
      var nextTab = string.indexOf("\t", pos);
      if (nextTab == -1) nextTab = string.length;
      var skipped = nextTab - pos;
      if (nextTab == string.length || col + skipped >= goal)
        return pos + Math.min(skipped, goal - col);
      col += nextTab - pos;
      col += tabSize - (col % tabSize);
      pos = nextTab + 1;
      if (col >= goal) return pos;
    }
  }

  var spaceStrs = [""];
  function spaceStr(n) {
    while (spaceStrs.length <= n)
      spaceStrs.push(lst(spaceStrs) + " ");
    return spaceStrs[n];
  }

  function lst(arr) { return arr[arr.length-1]; }

  var selectInput = function(node) { node.select(); };
  if (ios) // Mobile Safari apparently has a bug where select() is broken.
    selectInput = function(node) { node.selectionStart = 0; node.selectionEnd = node.value.length; };
  else if (ie) // Suppress mysterious IE10 errors
    selectInput = function(node) { try { node.select(); } catch(_e) {} };

  function indexOf(array, elt) {
    for (var i = 0; i < array.length; ++i)
      if (array[i] == elt) return i;
    return -1;
  }
  function map(array, f) {
    var out = [];
    for (var i = 0; i < array.length; i++) out[i] = f(array[i], i);
    return out;
  }

  function nothing() {}

  function createObj(base, props) {
    var inst;
    if (Object.create) {
      inst = Object.create(base);
    } else {
      nothing.prototype = base;
      inst = new nothing();
    }
    if (props) copyObj(props, inst);
    return inst;
  };

  function copyObj(obj, target, overwrite) {
    if (!target) target = {};
    for (var prop in obj)
      if (obj.hasOwnProperty(prop) && (overwrite !== false || !target.hasOwnProperty(prop)))
        target[prop] = obj[prop];
    return target;
  }

  function bind(f) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function(){return f.apply(null, args);};
  }

  var nonASCIISingleCaseWordChar = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
  var isWordCharBasic = CodeMirror.isWordChar = function(ch) {
    return /\w/.test(ch) || ch > "\x80" &&
      (ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch));
  };
  function isWordChar(ch, helper) {
    if (!helper) return isWordCharBasic(ch);
    if (helper.source.indexOf("\\w") > -1 && isWordCharBasic(ch)) return true;
    return helper.test(ch);
  }

  function isEmpty(obj) {
    for (var n in obj) if (obj.hasOwnProperty(n) && obj[n]) return false;
    return true;
  }

  // Extending unicode characters. A series of a non-extending char +
  // any number of extending chars is treated as a single unit as far
  // as editing and measuring is concerned. This is not fully correct,
  // since some scripts/fonts/browsers also treat other configurations
  // of code points as a group.
  var extendingChars = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u065e\u0670\u06d6-\u06dc\u06de-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0900-\u0902\u093c\u0941-\u0948\u094d\u0951-\u0955\u0962\u0963\u0981\u09bc\u09be\u09c1-\u09c4\u09cd\u09d7\u09e2\u09e3\u0a01\u0a02\u0a3c\u0a41\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a70\u0a71\u0a75\u0a81\u0a82\u0abc\u0ac1-\u0ac5\u0ac7\u0ac8\u0acd\u0ae2\u0ae3\u0b01\u0b3c\u0b3e\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b57\u0b62\u0b63\u0b82\u0bbe\u0bc0\u0bcd\u0bd7\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0cbc\u0cbf\u0cc2\u0cc6\u0ccc\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0d3e\u0d41-\u0d44\u0d4d\u0d57\u0d62\u0d63\u0dca\u0dcf\u0dd2-\u0dd4\u0dd6\u0ddf\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u0f18\u0f19\u0f35\u0f37\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86\u0f87\u0f90-\u0f97\u0f99-\u0fbc\u0fc6\u102d-\u1030\u1032-\u1037\u1039\u103a\u103d\u103e\u1058\u1059\u105e-\u1060\u1071-\u1074\u1082\u1085\u1086\u108d\u109d\u135f\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b7-\u17bd\u17c6\u17c9-\u17d3\u17dd\u180b-\u180d\u18a9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193b\u1a17\u1a18\u1a56\u1a58-\u1a5e\u1a60\u1a62\u1a65-\u1a6c\u1a73-\u1a7c\u1a7f\u1b00-\u1b03\u1b34\u1b36-\u1b3a\u1b3c\u1b42\u1b6b-\u1b73\u1b80\u1b81\u1ba2-\u1ba5\u1ba8\u1ba9\u1c2c-\u1c33\u1c36\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce0\u1ce2-\u1ce8\u1ced\u1dc0-\u1de6\u1dfd-\u1dff\u200c\u200d\u20d0-\u20f0\u2cef-\u2cf1\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua66f-\ua672\ua67c\ua67d\ua6f0\ua6f1\ua802\ua806\ua80b\ua825\ua826\ua8c4\ua8e0-\ua8f1\ua926-\ua92d\ua947-\ua951\ua980-\ua982\ua9b3\ua9b6-\ua9b9\ua9bc\uaa29-\uaa2e\uaa31\uaa32\uaa35\uaa36\uaa43\uaa4c\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uabe5\uabe8\uabed\udc00-\udfff\ufb1e\ufe00-\ufe0f\ufe20-\ufe26\uff9e\uff9f]/;
  function isExtendingChar(ch) { return ch.charCodeAt(0) >= 768 && extendingChars.test(ch); }

  // DOM UTILITIES

  function elt(tag, content, className, style) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (style) e.style.cssText = style;
    if (typeof content == "string") e.appendChild(document.createTextNode(content));
    else if (content) for (var i = 0; i < content.length; ++i) e.appendChild(content[i]);
    return e;
  }

  var range;
  if (document.createRange) range = function(node, start, end, endNode) {
    var r = document.createRange();
    r.setEnd(endNode || node, end);
    r.setStart(node, start);
    return r;
  };
  else range = function(node, start, end) {
    var r = document.body.createTextRange();
    try { r.moveToElementText(node.parentNode); }
    catch(e) { return r; }
    r.collapse(true);
    r.moveEnd("character", end);
    r.moveStart("character", start);
    return r;
  };

  function removeChildren(e) {
    for (var count = e.childNodes.length; count > 0; --count)
      e.removeChild(e.firstChild);
    return e;
  }

  function removeChildrenAndAdd(parent, e) {
    return removeChildren(parent).appendChild(e);
  }

  var contains = CodeMirror.contains = function(parent, child) {
    if (child.nodeType == 3) // Android browser always returns false when child is a textnode
      child = child.parentNode;
    if (parent.contains)
      return parent.contains(child);
    do {
      if (child.nodeType == 11) child = child.host;
      if (child == parent) return true;
    } while (child = child.parentNode);
  };

  function activeElt() {
    var activeElement = document.activeElement;
    while (activeElement && activeElement.root && activeElement.root.activeElement)
      activeElement = activeElement.root.activeElement;
    return activeElement;
  }
  // Older versions of IE throws unspecified error when touching
  // document.activeElement in some cases (during loading, in iframe)
  if (ie && ie_version < 11) activeElt = function() {
    try { return document.activeElement; }
    catch(e) { return document.body; }
  };

  function classTest(cls) { return new RegExp("(^|\\s)" + cls + "(?:$|\\s)\\s*"); }
  var rmClass = CodeMirror.rmClass = function(node, cls) {
    var current = node.className;
    var match = classTest(cls).exec(current);
    if (match) {
      var after = current.slice(match.index + match[0].length);
      node.className = current.slice(0, match.index) + (after ? match[1] + after : "");
    }
  };
  var addClass = CodeMirror.addClass = function(node, cls) {
    var current = node.className;
    if (!classTest(cls).test(current)) node.className += (current ? " " : "") + cls;
  };
  function joinClasses(a, b) {
    var as = a.split(" ");
    for (var i = 0; i < as.length; i++)
      if (as[i] && !classTest(as[i]).test(b)) b += " " + as[i];
    return b;
  }

  // WINDOW-WIDE EVENTS

  // These must be handled carefully, because naively registering a
  // handler for each editor will cause the editors to never be
  // garbage collected.

  function forEachCodeMirror(f) {
    if (!document.body.getElementsByClassName) return;
    var byClass = document.body.getElementsByClassName("CodeMirror");
    for (var i = 0; i < byClass.length; i++) {
      var cm = byClass[i].CodeMirror;
      if (cm) f(cm);
    }
  }

  var globalsRegistered = false;
  function ensureGlobalHandlers() {
    if (globalsRegistered) return;
    registerGlobalHandlers();
    globalsRegistered = true;
  }
  function registerGlobalHandlers() {
    // When the window resizes, we need to refresh active editors.
    var resizeTimer;
    on(window, "resize", function() {
      if (resizeTimer == null) resizeTimer = setTimeout(function() {
        resizeTimer = null;
        forEachCodeMirror(onResize);
      }, 100);
    });
    // When the window loses focus, we want to show the editor as blurred
    on(window, "blur", function() {
      forEachCodeMirror(onBlur);
    });
  }

  // FEATURE DETECTION

  // Detect drag-and-drop
  var dragAndDrop = function() {
    // There is *some* kind of drag-and-drop support in IE6-8, but I
    // couldn't get it to work yet.
    if (ie && ie_version < 9) return false;
    var div = elt('div');
    return "draggable" in div || "dragDrop" in div;
  }();

  var zwspSupported;
  function zeroWidthElement(measure) {
    if (zwspSupported == null) {
      var test = elt("span", "\u200b");
      removeChildrenAndAdd(measure, elt("span", [test, document.createTextNode("x")]));
      if (measure.firstChild.offsetHeight != 0)
        zwspSupported = test.offsetWidth <= 1 && test.offsetHeight > 2 && !(ie && ie_version < 8);
    }
    var node = zwspSupported ? elt("span", "\u200b") :
      elt("span", "\u00a0", null, "display: inline-block; width: 1px; margin-right: -1px");
    node.setAttribute("cm-text", "");
    return node;
  }

  // Feature-detect IE's crummy client rect reporting for bidi text
  var badBidiRects;
  function hasBadBidiRects(measure) {
    if (badBidiRects != null) return badBidiRects;
    var txt = removeChildrenAndAdd(measure, document.createTextNode("A\u062eA"));
    var r0 = range(txt, 0, 1).getBoundingClientRect();
    if (!r0 || r0.left == r0.right) return false; // Safari returns null in some cases (#2780)
    var r1 = range(txt, 1, 2).getBoundingClientRect();
    return badBidiRects = (r1.right - r0.right < 3);
  }

  // See if "".split is the broken IE version, if so, provide an
  // alternative way to split lines.
  var splitLinesAuto = CodeMirror.splitLines = "\n\nb".split(/\n/).length != 3 ? function(string) {
    var pos = 0, result = [], l = string.length;
    while (pos <= l) {
      var nl = string.indexOf("\n", pos);
      if (nl == -1) nl = string.length;
      var line = string.slice(pos, string.charAt(nl - 1) == "\r" ? nl - 1 : nl);
      var rt = line.indexOf("\r");
      if (rt != -1) {
        result.push(line.slice(0, rt));
        pos += rt + 1;
      } else {
        result.push(line);
        pos = nl + 1;
      }
    }
    return result;
  } : function(string){return string.split(/\r\n?|\n/);};

  var hasSelection = window.getSelection ? function(te) {
    try { return te.selectionStart != te.selectionEnd; }
    catch(e) { return false; }
  } : function(te) {
    try {var range = te.ownerDocument.selection.createRange();}
    catch(e) {}
    if (!range || range.parentElement() != te) return false;
    return range.compareEndPoints("StartToEnd", range) != 0;
  };

  var hasCopyEvent = (function() {
    var e = elt("div");
    if ("oncopy" in e) return true;
    e.setAttribute("oncopy", "return;");
    return typeof e.oncopy == "function";
  })();

  var badZoomedRects = null;
  function hasBadZoomedRects(measure) {
    if (badZoomedRects != null) return badZoomedRects;
    var node = removeChildrenAndAdd(measure, elt("span", "x"));
    var normal = node.getBoundingClientRect();
    var fromRange = range(node, 0, 1).getBoundingClientRect();
    return badZoomedRects = Math.abs(normal.left - fromRange.left) > 1;
  }

  // KEY NAMES

  var keyNames = CodeMirror.keyNames = {
    3: "Enter", 8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt",
    19: "Pause", 20: "CapsLock", 27: "Esc", 32: "Space", 33: "PageUp", 34: "PageDown", 35: "End",
    36: "Home", 37: "Left", 38: "Up", 39: "Right", 40: "Down", 44: "PrintScrn", 45: "Insert",
    46: "Delete", 59: ";", 61: "=", 91: "Mod", 92: "Mod", 93: "Mod",
    106: "*", 107: "=", 109: "-", 110: ".", 111: "/", 127: "Delete",
    173: "-", 186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\",
    221: "]", 222: "'", 63232: "Up", 63233: "Down", 63234: "Left", 63235: "Right", 63272: "Delete",
    63273: "Home", 63275: "End", 63276: "PageUp", 63277: "PageDown", 63302: "Insert"
  };
  (function() {
    // Number keys
    for (var i = 0; i < 10; i++) keyNames[i + 48] = keyNames[i + 96] = String(i);
    // Alphabetic keys
    for (var i = 65; i <= 90; i++) keyNames[i] = String.fromCharCode(i);
    // Function keys
    for (var i = 1; i <= 12; i++) keyNames[i + 111] = keyNames[i + 63235] = "F" + i;
  })();

  // BIDI HELPERS

  function iterateBidiSections(order, from, to, f) {
    if (!order) return f(from, to, "ltr");
    var found = false;
    for (var i = 0; i < order.length; ++i) {
      var part = order[i];
      if (part.from < to && part.to > from || from == to && part.to == from) {
        f(Math.max(part.from, from), Math.min(part.to, to), part.level == 1 ? "rtl" : "ltr");
        found = true;
      }
    }
    if (!found) f(from, to, "ltr");
  }

  function bidiLeft(part) { return part.level % 2 ? part.to : part.from; }
  function bidiRight(part) { return part.level % 2 ? part.from : part.to; }

  function lineLeft(line) { var order = getOrder(line); return order ? bidiLeft(order[0]) : 0; }
  function lineRight(line) {
    var order = getOrder(line);
    if (!order) return line.text.length;
    return bidiRight(lst(order));
  }

  function lineStart(cm, lineN) {
    var line = getLine(cm.doc, lineN);
    var visual = visualLine(line);
    if (visual != line) lineN = lineNo(visual);
    var order = getOrder(visual);
    var ch = !order ? 0 : order[0].level % 2 ? lineRight(visual) : lineLeft(visual);
    return Pos(lineN, ch);
  }
  function lineEnd(cm, lineN) {
    var merged, line = getLine(cm.doc, lineN);
    while (merged = collapsedSpanAtEnd(line)) {
      line = merged.find(1, true).line;
      lineN = null;
    }
    var order = getOrder(line);
    var ch = !order ? line.text.length : order[0].level % 2 ? lineLeft(line) : lineRight(line);
    return Pos(lineN == null ? lineNo(line) : lineN, ch);
  }
  function lineStartSmart(cm, pos) {
    var start = lineStart(cm, pos.line);
    var line = getLine(cm.doc, start.line);
    var order = getOrder(line);
    if (!order || order[0].level == 0) {
      var firstNonWS = Math.max(0, line.text.search(/\S/));
      var inWS = pos.line == start.line && pos.ch <= firstNonWS && pos.ch;
      return Pos(start.line, inWS ? 0 : firstNonWS);
    }
    return start;
  }

  function compareBidiLevel(order, a, b) {
    var linedir = order[0].level;
    if (a == linedir) return true;
    if (b == linedir) return false;
    return a < b;
  }
  var bidiOther;
  function getBidiPartAt(order, pos) {
    bidiOther = null;
    for (var i = 0, found; i < order.length; ++i) {
      var cur = order[i];
      if (cur.from < pos && cur.to > pos) return i;
      if ((cur.from == pos || cur.to == pos)) {
        if (found == null) {
          found = i;
        } else if (compareBidiLevel(order, cur.level, order[found].level)) {
          if (cur.from != cur.to) bidiOther = found;
          return i;
        } else {
          if (cur.from != cur.to) bidiOther = i;
          return found;
        }
      }
    }
    return found;
  }

  function moveInLine(line, pos, dir, byUnit) {
    if (!byUnit) return pos + dir;
    do pos += dir;
    while (pos > 0 && isExtendingChar(line.text.charAt(pos)));
    return pos;
  }

  // This is needed in order to move 'visually' through bi-directional
  // text -- i.e., pressing left should make the cursor go left, even
  // when in RTL text. The tricky part is the 'jumps', where RTL and
  // LTR text touch each other. This often requires the cursor offset
  // to move more than one unit, in order to visually move one unit.
  function moveVisually(line, start, dir, byUnit) {
    var bidi = getOrder(line);
    if (!bidi) return moveLogically(line, start, dir, byUnit);
    var pos = getBidiPartAt(bidi, start), part = bidi[pos];
    var target = moveInLine(line, start, part.level % 2 ? -dir : dir, byUnit);

    for (;;) {
      if (target > part.from && target < part.to) return target;
      if (target == part.from || target == part.to) {
        if (getBidiPartAt(bidi, target) == pos) return target;
        part = bidi[pos += dir];
        return (dir > 0) == part.level % 2 ? part.to : part.from;
      } else {
        part = bidi[pos += dir];
        if (!part) return null;
        if ((dir > 0) == part.level % 2)
          target = moveInLine(line, part.to, -1, byUnit);
        else
          target = moveInLine(line, part.from, 1, byUnit);
      }
    }
  }

  function moveLogically(line, start, dir, byUnit) {
    var target = start + dir;
    if (byUnit) while (target > 0 && isExtendingChar(line.text.charAt(target))) target += dir;
    return target < 0 || target > line.text.length ? null : target;
  }

  // Bidirectional ordering algorithm
  // See http://unicode.org/reports/tr9/tr9-13.html for the algorithm
  // that this (partially) implements.

  // One-char codes used for character types:
  // L (L):   Left-to-Right
  // R (R):   Right-to-Left
  // r (AL):  Right-to-Left Arabic
  // 1 (EN):  European Number
  // + (ES):  European Number Separator
  // % (ET):  European Number Terminator
  // n (AN):  Arabic Number
  // , (CS):  Common Number Separator
  // m (NSM): Non-Spacing Mark
  // b (BN):  Boundary Neutral
  // s (B):   Paragraph Separator
  // t (S):   Segment Separator
  // w (WS):  Whitespace
  // N (ON):  Other Neutrals

  // Returns null if characters are ordered as they appear
  // (left-to-right), or an array of sections ({from, to, level}
  // objects) in the order in which they occur visually.
  var bidiOrdering = (function() {
    // Character types for codepoints 0 to 0xff
    var lowTypes = "bbbbbbbbbtstwsbbbbbbbbbbbbbbssstwNN%%%NNNNNN,N,N1111111111NNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNbbbbbbsbbbbbbbbbbbbbbbbbbbbbbbbbb,N%%%%NNNNLNNNNN%%11NLNNN1LNNNNNLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLN";
    // Character types for codepoints 0x600 to 0x6ff
    var arabicTypes = "rrrrrrrrrrrr,rNNmmmmmmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmrrrrrrrnnnnnnnnnn%nnrrrmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmmmmmmNmmmm";
    function charType(code) {
      if (code <= 0xf7) return lowTypes.charAt(code);
      else if (0x590 <= code && code <= 0x5f4) return "R";
      else if (0x600 <= code && code <= 0x6ed) return arabicTypes.charAt(code - 0x600);
      else if (0x6ee <= code && code <= 0x8ac) return "r";
      else if (0x2000 <= code && code <= 0x200b) return "w";
      else if (code == 0x200c) return "b";
      else return "L";
    }

    var bidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
    var isNeutral = /[stwN]/, isStrong = /[LRr]/, countsAsLeft = /[Lb1n]/, countsAsNum = /[1n]/;
    // Browsers seem to always treat the boundaries of block elements as being L.
    var outerType = "L";

    function BidiSpan(level, from, to) {
      this.level = level;
      this.from = from; this.to = to;
    }

    return function(str) {
      if (!bidiRE.test(str)) return false;
      var len = str.length, types = [];
      for (var i = 0, type; i < len; ++i)
        types.push(type = charType(str.charCodeAt(i)));

      // W1. Examine each non-spacing mark (NSM) in the level run, and
      // change the type of the NSM to the type of the previous
      // character. If the NSM is at the start of the level run, it will
      // get the type of sor.
      for (var i = 0, prev = outerType; i < len; ++i) {
        var type = types[i];
        if (type == "m") types[i] = prev;
        else prev = type;
      }

      // W2. Search backwards from each instance of a European number
      // until the first strong type (R, L, AL, or sor) is found. If an
      // AL is found, change the type of the European number to Arabic
      // number.
      // W3. Change all ALs to R.
      for (var i = 0, cur = outerType; i < len; ++i) {
        var type = types[i];
        if (type == "1" && cur == "r") types[i] = "n";
        else if (isStrong.test(type)) { cur = type; if (type == "r") types[i] = "R"; }
      }

      // W4. A single European separator between two European numbers
      // changes to a European number. A single common separator between
      // two numbers of the same type changes to that type.
      for (var i = 1, prev = types[0]; i < len - 1; ++i) {
        var type = types[i];
        if (type == "+" && prev == "1" && types[i+1] == "1") types[i] = "1";
        else if (type == "," && prev == types[i+1] &&
                 (prev == "1" || prev == "n")) types[i] = prev;
        prev = type;
      }

      // W5. A sequence of European terminators adjacent to European
      // numbers changes to all European numbers.
      // W6. Otherwise, separators and terminators change to Other
      // Neutral.
      for (var i = 0; i < len; ++i) {
        var type = types[i];
        if (type == ",") types[i] = "N";
        else if (type == "%") {
          for (var end = i + 1; end < len && types[end] == "%"; ++end) {}
          var replace = (i && types[i-1] == "!") || (end < len && types[end] == "1") ? "1" : "N";
          for (var j = i; j < end; ++j) types[j] = replace;
          i = end - 1;
        }
      }

      // W7. Search backwards from each instance of a European number
      // until the first strong type (R, L, or sor) is found. If an L is
      // found, then change the type of the European number to L.
      for (var i = 0, cur = outerType; i < len; ++i) {
        var type = types[i];
        if (cur == "L" && type == "1") types[i] = "L";
        else if (isStrong.test(type)) cur = type;
      }

      // N1. A sequence of neutrals takes the direction of the
      // surrounding strong text if the text on both sides has the same
      // direction. European and Arabic numbers act as if they were R in
      // terms of their influence on neutrals. Start-of-level-run (sor)
      // and end-of-level-run (eor) are used at level run boundaries.
      // N2. Any remaining neutrals take the embedding direction.
      for (var i = 0; i < len; ++i) {
        if (isNeutral.test(types[i])) {
          for (var end = i + 1; end < len && isNeutral.test(types[end]); ++end) {}
          var before = (i ? types[i-1] : outerType) == "L";
          var after = (end < len ? types[end] : outerType) == "L";
          var replace = before || after ? "L" : "R";
          for (var j = i; j < end; ++j) types[j] = replace;
          i = end - 1;
        }
      }

      // Here we depart from the documented algorithm, in order to avoid
      // building up an actual levels array. Since there are only three
      // levels (0, 1, 2) in an implementation that doesn't take
      // explicit embedding into account, we can build up the order on
      // the fly, without following the level-based algorithm.
      var order = [], m;
      for (var i = 0; i < len;) {
        if (countsAsLeft.test(types[i])) {
          var start = i;
          for (++i; i < len && countsAsLeft.test(types[i]); ++i) {}
          order.push(new BidiSpan(0, start, i));
        } else {
          var pos = i, at = order.length;
          for (++i; i < len && types[i] != "L"; ++i) {}
          for (var j = pos; j < i;) {
            if (countsAsNum.test(types[j])) {
              if (pos < j) order.splice(at, 0, new BidiSpan(1, pos, j));
              var nstart = j;
              for (++j; j < i && countsAsNum.test(types[j]); ++j) {}
              order.splice(at, 0, new BidiSpan(2, nstart, j));
              pos = j;
            } else ++j;
          }
          if (pos < i) order.splice(at, 0, new BidiSpan(1, pos, i));
        }
      }
      if (order[0].level == 1 && (m = str.match(/^\s+/))) {
        order[0].from = m[0].length;
        order.unshift(new BidiSpan(0, 0, m[0].length));
      }
      if (lst(order).level == 1 && (m = str.match(/\s+$/))) {
        lst(order).to -= m[0].length;
        order.push(new BidiSpan(0, len - m[0].length, len));
      }
      if (order[0].level == 2)
        order.unshift(new BidiSpan(1, order[0].to, order[0].to));
      if (order[0].level != lst(order).level)
        order.push(new BidiSpan(order[0].level, len, len));

      return order;
    };
  })();

  // THE END

  CodeMirror.version = "5.9.0";

  return CodeMirror;
});

},{}],"react-codemirror":[function(require,module,exports){
'use strict';

var CM = require('codemirror');
var React = require('react');
var className = require('classnames');

var CodeMirror = React.createClass({
  displayName: 'CodeMirror',

  propTypes: {
    onChange: React.PropTypes.func,
    onFocusChange: React.PropTypes.func,
    options: React.PropTypes.object,
    path: React.PropTypes.string,
    value: React.PropTypes.string,
    className: React.PropTypes.any
  },

  getInitialState: function getInitialState() {
    return {
      isFocused: false
    };
  },

  componentDidMount: function componentDidMount() {
    var textareaNode = this.refs.textarea;
    this.codeMirror = CM.fromTextArea(textareaNode, this.props.options);
    this.codeMirror.on('change', this.codemirrorValueChanged);
    this.codeMirror.on('focus', this.focusChanged.bind(this, true));
    this.codeMirror.on('blur', this.focusChanged.bind(this, false));
    this._currentCodemirrorValue = this.props.defaultValue || this.props.value || '';
    this.codeMirror.setValue(this._currentCodemirrorValue);
  },

  componentWillUnmount: function componentWillUnmount() {
    // todo: is there a lighter-weight way to remove the cm instance?
    if (this.codeMirror) {
      this.codeMirror.toTextArea();
    }
  },

  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    if (this.codeMirror && nextProps.value !== undefined && this._currentCodemirrorValue !== nextProps.value) {
      this.codeMirror.setValue(nextProps.value);
    }
    if (typeof nextProps.options === 'object') {
      for (var optionName in nextProps.options) {
        if (nextProps.options.hasOwnProperty(optionName)) {
          this.codeMirror.setOption(optionName, nextProps.options[optionName]);
        }
      }
    }
  },

  getCodeMirror: function getCodeMirror() {
    return this.codeMirror;
  },

  focus: function focus() {
    if (this.codeMirror) {
      this.codeMirror.focus();
    }
  },

  focusChanged: function focusChanged(focused) {
    this.setState({
      isFocused: focused
    });
    this.props.onFocusChange && this.props.onFocusChange(focused);
  },

  codemirrorValueChanged: function codemirrorValueChanged(doc, change) {
    var newValue = doc.getValue();
    this._currentCodemirrorValue = newValue;
    this.props.onChange && this.props.onChange(newValue);
  },

  render: function render() {
    var editorClassName = className('ReactCodeMirror', this.state.isFocused ? 'ReactCodeMirror--focused' : null, this.props.className);

    return React.createElement(
      'div',
      { className: editorClassName },
      React.createElement('textarea', { ref: 'textarea', name: this.props.path, defaultValue: '', autoComplete: 'off' })
    );
  }

});

module.exports = CodeMirror;

},{"classnames":1,"codemirror":2,"react":undefined}]},{},[])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9yZWFjdC1jb21wb25lbnQtZ3VscC10YXNrcy9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwibm9kZV9tb2R1bGVzL2NsYXNzbmFtZXMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvY29kZW1pcnJvci9saWIvY29kZW1pcnJvci5qcyIsIi9Vc2Vycy9lZHdhcmR3ZXltb3V0aC9jb2RlL3Byb2plY3RzL21vbnRhbmFDb2RlU2Nob29sL3Byb2plY3RzLzJuZDN3ZWVrcy9yZWFjdC1jb2RlbWlycm9yL3NyYy9Db2RlbWlycm9yLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN4cVJBLElBQUksRUFBRSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUMvQixJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDN0IsSUFBSSxTQUFTLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDOztBQUV0QyxJQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDOzs7QUFFbEMsVUFBUyxFQUFFO0FBQ1YsVUFBUSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSTtBQUM5QixlQUFhLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJO0FBQ25DLFNBQU8sRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU07QUFDL0IsTUFBSSxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTTtBQUM1QixPQUFLLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNO0FBQzdCLFdBQVMsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUc7RUFDOUI7O0FBRUQsZ0JBQWUsRUFBQywyQkFBRztBQUNsQixTQUFPO0FBQ04sWUFBUyxFQUFFLEtBQUs7R0FDaEIsQ0FBQztFQUNGOztBQUVELGtCQUFpQixFQUFDLDZCQUFHO0FBQ3BCLE1BQUksWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDO0FBQ3RDLE1BQUksQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUNwRSxNQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFDMUQsTUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ2hFLE1BQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNoRSxNQUFJLENBQUMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO0FBQ2pGLE1BQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0VBQ3ZEOztBQUVELHFCQUFvQixFQUFDLGdDQUFHOztBQUV2QixNQUFJLElBQUksQ0FBQyxVQUFVLEVBQUU7QUFDcEIsT0FBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQztHQUM3QjtFQUNEOztBQUVELDBCQUF5QixFQUFDLG1DQUFDLFNBQVMsRUFBRTtBQUNyQyxNQUFJLElBQUksQ0FBQyxVQUFVLElBQUksU0FBUyxDQUFDLEtBQUssS0FBSyxTQUFTLElBQUksSUFBSSxDQUFDLHVCQUF1QixLQUFLLFNBQVMsQ0FBQyxLQUFLLEVBQUU7QUFDekcsT0FBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0dBQzFDO0FBQ0QsTUFBSSxPQUFPLFNBQVMsQ0FBQyxPQUFPLEtBQUssUUFBUSxFQUFFO0FBQzFDLFFBQUssSUFBSSxVQUFVLElBQUksU0FBUyxDQUFDLE9BQU8sRUFBRTtBQUN6QyxRQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFO0FBQ2pELFNBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7S0FDckU7SUFDRDtHQUNEO0VBQ0Q7O0FBRUQsY0FBYSxFQUFDLHlCQUFHO0FBQ2hCLFNBQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztFQUN2Qjs7QUFFRCxNQUFLLEVBQUMsaUJBQUc7QUFDUixNQUFJLElBQUksQ0FBQyxVQUFVLEVBQUU7QUFDcEIsT0FBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztHQUN4QjtFQUNEOztBQUVELGFBQVksRUFBQyxzQkFBQyxPQUFPLEVBQUU7QUFDdEIsTUFBSSxDQUFDLFFBQVEsQ0FBQztBQUNiLFlBQVMsRUFBRSxPQUFPO0dBQ2xCLENBQUMsQ0FBQztBQUNILE1BQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0VBQzlEOztBQUVELHVCQUFzQixFQUFDLGdDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUU7QUFDcEMsTUFBSSxRQUFRLEdBQUcsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDO0FBQzlCLE1BQUksQ0FBQyx1QkFBdUIsR0FBRyxRQUFRLENBQUM7QUFDeEMsTUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7RUFDckQ7O0FBRUQsT0FBTSxFQUFDLGtCQUFHO0FBQ1QsTUFBSSxlQUFlLEdBQUcsU0FBUyxDQUM5QixpQkFBaUIsRUFDakIsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsMEJBQTBCLEdBQUcsSUFBSSxFQUN4RCxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FDcEIsQ0FBQzs7QUFFRixTQUNDOztLQUFLLFNBQVMsRUFBRSxlQUFlLEFBQUM7R0FDL0Isa0NBQVUsR0FBRyxFQUFDLFVBQVUsRUFBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEFBQUMsRUFBQyxZQUFZLEVBQUUsRUFBRSxBQUFDLEVBQUMsWUFBWSxFQUFDLEtBQUssR0FBRztHQUNsRixDQUNMO0VBQ0Y7O0NBRUQsQ0FBQyxDQUFDOztBQUVILE1BQU0sQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIVxuICBDb3B5cmlnaHQgKGMpIDIwMTUgSmVkIFdhdHNvbi5cbiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlIChNSVQpLCBzZWVcbiAgaHR0cDovL2plZHdhdHNvbi5naXRodWIuaW8vY2xhc3NuYW1lc1xuKi9cbi8qIGdsb2JhbCBkZWZpbmUgKi9cblxuKGZ1bmN0aW9uICgpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG5cdHZhciBoYXNPd24gPSB7fS5oYXNPd25Qcm9wZXJ0eTtcblxuXHRmdW5jdGlvbiBjbGFzc05hbWVzICgpIHtcblx0XHR2YXIgY2xhc3NlcyA9ICcnO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciBhcmcgPSBhcmd1bWVudHNbaV07XG5cdFx0XHRpZiAoIWFyZykgY29udGludWU7XG5cblx0XHRcdHZhciBhcmdUeXBlID0gdHlwZW9mIGFyZztcblxuXHRcdFx0aWYgKGFyZ1R5cGUgPT09ICdzdHJpbmcnIHx8IGFyZ1R5cGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGNsYXNzZXMgKz0gJyAnICsgYXJnO1xuXHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGFyZykpIHtcblx0XHRcdFx0Y2xhc3NlcyArPSAnICcgKyBjbGFzc05hbWVzLmFwcGx5KG51bGwsIGFyZyk7XG5cdFx0XHR9IGVsc2UgaWYgKGFyZ1R5cGUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGZvciAodmFyIGtleSBpbiBhcmcpIHtcblx0XHRcdFx0XHRpZiAoaGFzT3duLmNhbGwoYXJnLCBrZXkpICYmIGFyZ1trZXldKSB7XG5cdFx0XHRcdFx0XHRjbGFzc2VzICs9ICcgJyArIGtleTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2xhc3Nlcy5zdWJzdHIoMSk7XG5cdH1cblxuXHRpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcblx0XHRtb2R1bGUuZXhwb3J0cyA9IGNsYXNzTmFtZXM7XG5cdH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgZGVmaW5lLmFtZCA9PT0gJ29iamVjdCcgJiYgZGVmaW5lLmFtZCkge1xuXHRcdC8vIHJlZ2lzdGVyIGFzICdjbGFzc25hbWVzJywgY29uc2lzdGVudCB3aXRoIG5wbSBwYWNrYWdlIG5hbWVcblx0XHRkZWZpbmUoJ2NsYXNzbmFtZXMnLCBbXSwgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIGNsYXNzTmFtZXM7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0d2luZG93LmNsYXNzTmFtZXMgPSBjbGFzc05hbWVzO1xuXHR9XG59KCkpO1xuIiwiLy8gQ29kZU1pcnJvciwgY29weXJpZ2h0IChjKSBieSBNYXJpam4gSGF2ZXJiZWtlIGFuZCBvdGhlcnNcbi8vIERpc3RyaWJ1dGVkIHVuZGVyIGFuIE1JVCBsaWNlbnNlOiBodHRwOi8vY29kZW1pcnJvci5uZXQvTElDRU5TRVxuXG4vLyBUaGlzIGlzIENvZGVNaXJyb3IgKGh0dHA6Ly9jb2RlbWlycm9yLm5ldCksIGEgY29kZSBlZGl0b3Jcbi8vIGltcGxlbWVudGVkIGluIEphdmFTY3JpcHQgb24gdG9wIG9mIHRoZSBicm93c2VyJ3MgRE9NLlxuLy9cbi8vIFlvdSBjYW4gZmluZCBzb21lIHRlY2huaWNhbCBiYWNrZ3JvdW5kIGZvciBzb21lIG9mIHRoZSBjb2RlIGJlbG93XG4vLyBhdCBodHRwOi8vbWFyaWpuaGF2ZXJiZWtlLm5sL2Jsb2cvI2NtLWludGVybmFscyAuXG5cbihmdW5jdGlvbihtb2QpIHtcbiAgaWYgKHR5cGVvZiBleHBvcnRzID09IFwib2JqZWN0XCIgJiYgdHlwZW9mIG1vZHVsZSA9PSBcIm9iamVjdFwiKSAvLyBDb21tb25KU1xuICAgIG1vZHVsZS5leHBvcnRzID0gbW9kKCk7XG4gIGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT0gXCJmdW5jdGlvblwiICYmIGRlZmluZS5hbWQpIC8vIEFNRFxuICAgIHJldHVybiBkZWZpbmUoW10sIG1vZCk7XG4gIGVsc2UgLy8gUGxhaW4gYnJvd3NlciBlbnZcbiAgICB0aGlzLkNvZGVNaXJyb3IgPSBtb2QoKTtcbn0pKGZ1bmN0aW9uKCkge1xuICBcInVzZSBzdHJpY3RcIjtcblxuICAvLyBCUk9XU0VSIFNOSUZGSU5HXG5cbiAgLy8gS2x1ZGdlcyBmb3IgYnVncyBhbmQgYmVoYXZpb3IgZGlmZmVyZW5jZXMgdGhhdCBjYW4ndCBiZSBmZWF0dXJlXG4gIC8vIGRldGVjdGVkIGFyZSBlbmFibGVkIGJhc2VkIG9uIHVzZXJBZ2VudCBldGMgc25pZmZpbmcuXG4gIHZhciB1c2VyQWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuICB2YXIgcGxhdGZvcm0gPSBuYXZpZ2F0b3IucGxhdGZvcm07XG5cbiAgdmFyIGdlY2tvID0gL2dlY2tvXFwvXFxkL2kudGVzdCh1c2VyQWdlbnQpO1xuICB2YXIgaWVfdXB0bzEwID0gL01TSUUgXFxkLy50ZXN0KHVzZXJBZ2VudCk7XG4gIHZhciBpZV8xMXVwID0gL1RyaWRlbnRcXC8oPzpbNy05XXxcXGR7Mix9KVxcLi4qcnY6KFxcZCspLy5leGVjKHVzZXJBZ2VudCk7XG4gIHZhciBpZSA9IGllX3VwdG8xMCB8fCBpZV8xMXVwO1xuICB2YXIgaWVfdmVyc2lvbiA9IGllICYmIChpZV91cHRvMTAgPyBkb2N1bWVudC5kb2N1bWVudE1vZGUgfHwgNiA6IGllXzExdXBbMV0pO1xuICB2YXIgd2Via2l0ID0gL1dlYktpdFxcLy8udGVzdCh1c2VyQWdlbnQpO1xuICB2YXIgcXR3ZWJraXQgPSB3ZWJraXQgJiYgL1F0XFwvXFxkK1xcLlxcZCsvLnRlc3QodXNlckFnZW50KTtcbiAgdmFyIGNocm9tZSA9IC9DaHJvbWVcXC8vLnRlc3QodXNlckFnZW50KTtcbiAgdmFyIHByZXN0byA9IC9PcGVyYVxcLy8udGVzdCh1c2VyQWdlbnQpO1xuICB2YXIgc2FmYXJpID0gL0FwcGxlIENvbXB1dGVyLy50ZXN0KG5hdmlnYXRvci52ZW5kb3IpO1xuICB2YXIgbWFjX2dlTW91bnRhaW5MaW9uID0gL01hYyBPUyBYIDFcXGRcXEQoWzgtOV18XFxkXFxkKVxcRC8udGVzdCh1c2VyQWdlbnQpO1xuICB2YXIgcGhhbnRvbSA9IC9QaGFudG9tSlMvLnRlc3QodXNlckFnZW50KTtcblxuICB2YXIgaW9zID0gL0FwcGxlV2ViS2l0Ly50ZXN0KHVzZXJBZ2VudCkgJiYgL01vYmlsZVxcL1xcdysvLnRlc3QodXNlckFnZW50KTtcbiAgLy8gVGhpcyBpcyB3b2VmdWxseSBpbmNvbXBsZXRlLiBTdWdnZXN0aW9ucyBmb3IgYWx0ZXJuYXRpdmUgbWV0aG9kcyB3ZWxjb21lLlxuICB2YXIgbW9iaWxlID0gaW9zIHx8IC9BbmRyb2lkfHdlYk9TfEJsYWNrQmVycnl8T3BlcmEgTWluaXxPcGVyYSBNb2JpfElFTW9iaWxlL2kudGVzdCh1c2VyQWdlbnQpO1xuICB2YXIgbWFjID0gaW9zIHx8IC9NYWMvLnRlc3QocGxhdGZvcm0pO1xuICB2YXIgd2luZG93cyA9IC93aW4vaS50ZXN0KHBsYXRmb3JtKTtcblxuICB2YXIgcHJlc3RvX3ZlcnNpb24gPSBwcmVzdG8gJiYgdXNlckFnZW50Lm1hdGNoKC9WZXJzaW9uXFwvKFxcZCpcXC5cXGQqKS8pO1xuICBpZiAocHJlc3RvX3ZlcnNpb24pIHByZXN0b192ZXJzaW9uID0gTnVtYmVyKHByZXN0b192ZXJzaW9uWzFdKTtcbiAgaWYgKHByZXN0b192ZXJzaW9uICYmIHByZXN0b192ZXJzaW9uID49IDE1KSB7IHByZXN0byA9IGZhbHNlOyB3ZWJraXQgPSB0cnVlOyB9XG4gIC8vIFNvbWUgYnJvd3NlcnMgdXNlIHRoZSB3cm9uZyBldmVudCBwcm9wZXJ0aWVzIHRvIHNpZ25hbCBjbWQvY3RybCBvbiBPUyBYXG4gIHZhciBmbGlwQ3RybENtZCA9IG1hYyAmJiAocXR3ZWJraXQgfHwgcHJlc3RvICYmIChwcmVzdG9fdmVyc2lvbiA9PSBudWxsIHx8IHByZXN0b192ZXJzaW9uIDwgMTIuMTEpKTtcbiAgdmFyIGNhcHR1cmVSaWdodENsaWNrID0gZ2Vja28gfHwgKGllICYmIGllX3ZlcnNpb24gPj0gOSk7XG5cbiAgLy8gT3B0aW1pemUgc29tZSBjb2RlIHdoZW4gdGhlc2UgZmVhdHVyZXMgYXJlIG5vdCB1c2VkLlxuICB2YXIgc2F3UmVhZE9ubHlTcGFucyA9IGZhbHNlLCBzYXdDb2xsYXBzZWRTcGFucyA9IGZhbHNlO1xuXG4gIC8vIEVESVRPUiBDT05TVFJVQ1RPUlxuXG4gIC8vIEEgQ29kZU1pcnJvciBpbnN0YW5jZSByZXByZXNlbnRzIGFuIGVkaXRvci4gVGhpcyBpcyB0aGUgb2JqZWN0XG4gIC8vIHRoYXQgdXNlciBjb2RlIGlzIHVzdWFsbHkgZGVhbGluZyB3aXRoLlxuXG4gIGZ1bmN0aW9uIENvZGVNaXJyb3IocGxhY2UsIG9wdGlvbnMpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQ29kZU1pcnJvcikpIHJldHVybiBuZXcgQ29kZU1pcnJvcihwbGFjZSwgb3B0aW9ucyk7XG5cbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zID0gb3B0aW9ucyA/IGNvcHlPYmoob3B0aW9ucykgOiB7fTtcbiAgICAvLyBEZXRlcm1pbmUgZWZmZWN0aXZlIG9wdGlvbnMgYmFzZWQgb24gZ2l2ZW4gdmFsdWVzIGFuZCBkZWZhdWx0cy5cbiAgICBjb3B5T2JqKGRlZmF1bHRzLCBvcHRpb25zLCBmYWxzZSk7XG4gICAgc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKG9wdGlvbnMpO1xuXG4gICAgdmFyIGRvYyA9IG9wdGlvbnMudmFsdWU7XG4gICAgaWYgKHR5cGVvZiBkb2MgPT0gXCJzdHJpbmdcIikgZG9jID0gbmV3IERvYyhkb2MsIG9wdGlvbnMubW9kZSwgbnVsbCwgb3B0aW9ucy5saW5lU2VwYXJhdG9yKTtcbiAgICB0aGlzLmRvYyA9IGRvYztcblxuICAgIHZhciBpbnB1dCA9IG5ldyBDb2RlTWlycm9yLmlucHV0U3R5bGVzW29wdGlvbnMuaW5wdXRTdHlsZV0odGhpcyk7XG4gICAgdmFyIGRpc3BsYXkgPSB0aGlzLmRpc3BsYXkgPSBuZXcgRGlzcGxheShwbGFjZSwgZG9jLCBpbnB1dCk7XG4gICAgZGlzcGxheS53cmFwcGVyLkNvZGVNaXJyb3IgPSB0aGlzO1xuICAgIHVwZGF0ZUd1dHRlcnModGhpcyk7XG4gICAgdGhlbWVDaGFuZ2VkKHRoaXMpO1xuICAgIGlmIChvcHRpb25zLmxpbmVXcmFwcGluZylcbiAgICAgIHRoaXMuZGlzcGxheS53cmFwcGVyLmNsYXNzTmFtZSArPSBcIiBDb2RlTWlycm9yLXdyYXBcIjtcbiAgICBpZiAob3B0aW9ucy5hdXRvZm9jdXMgJiYgIW1vYmlsZSkgZGlzcGxheS5pbnB1dC5mb2N1cygpO1xuICAgIGluaXRTY3JvbGxiYXJzKHRoaXMpO1xuXG4gICAgdGhpcy5zdGF0ZSA9IHtcbiAgICAgIGtleU1hcHM6IFtdLCAgLy8gc3RvcmVzIG1hcHMgYWRkZWQgYnkgYWRkS2V5TWFwXG4gICAgICBvdmVybGF5czogW10sIC8vIGhpZ2hsaWdodGluZyBvdmVybGF5cywgYXMgYWRkZWQgYnkgYWRkT3ZlcmxheVxuICAgICAgbW9kZUdlbjogMCwgICAvLyBidW1wZWQgd2hlbiBtb2RlL292ZXJsYXkgY2hhbmdlcywgdXNlZCB0byBpbnZhbGlkYXRlIGhpZ2hsaWdodGluZyBpbmZvXG4gICAgICBvdmVyd3JpdGU6IGZhbHNlLFxuICAgICAgZGVsYXlpbmdCbHVyRXZlbnQ6IGZhbHNlLFxuICAgICAgZm9jdXNlZDogZmFsc2UsXG4gICAgICBzdXBwcmVzc0VkaXRzOiBmYWxzZSwgLy8gdXNlZCB0byBkaXNhYmxlIGVkaXRpbmcgZHVyaW5nIGtleSBoYW5kbGVycyB3aGVuIGluIHJlYWRPbmx5IG1vZGVcbiAgICAgIHBhc3RlSW5jb21pbmc6IGZhbHNlLCBjdXRJbmNvbWluZzogZmFsc2UsIC8vIGhlbHAgcmVjb2duaXplIHBhc3RlL2N1dCBlZGl0cyBpbiBpbnB1dC5wb2xsXG4gICAgICBzZWxlY3RpbmdUZXh0OiBmYWxzZSxcbiAgICAgIGRyYWdnaW5nVGV4dDogZmFsc2UsXG4gICAgICBoaWdobGlnaHQ6IG5ldyBEZWxheWVkKCksIC8vIHN0b3JlcyBoaWdobGlnaHQgd29ya2VyIHRpbWVvdXRcbiAgICAgIGtleVNlcTogbnVsbCwgIC8vIFVuZmluaXNoZWQga2V5IHNlcXVlbmNlXG4gICAgICBzcGVjaWFsQ2hhcnM6IG51bGxcbiAgICB9O1xuXG4gICAgdmFyIGNtID0gdGhpcztcblxuICAgIC8vIE92ZXJyaWRlIG1hZ2ljIHRleHRhcmVhIGNvbnRlbnQgcmVzdG9yZSB0aGF0IElFIHNvbWV0aW1lcyBkb2VzXG4gICAgLy8gb24gb3VyIGhpZGRlbiB0ZXh0YXJlYSBvbiByZWxvYWRcbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDExKSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KHRydWUpOyB9LCAyMCk7XG5cbiAgICByZWdpc3RlckV2ZW50SGFuZGxlcnModGhpcyk7XG4gICAgZW5zdXJlR2xvYmFsSGFuZGxlcnMoKTtcblxuICAgIHN0YXJ0T3BlcmF0aW9uKHRoaXMpO1xuICAgIHRoaXMuY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgIGF0dGFjaERvYyh0aGlzLCBkb2MpO1xuXG4gICAgaWYgKChvcHRpb25zLmF1dG9mb2N1cyAmJiAhbW9iaWxlKSB8fCBjbS5oYXNGb2N1cygpKVxuICAgICAgc2V0VGltZW91dChiaW5kKG9uRm9jdXMsIHRoaXMpLCAyMCk7XG4gICAgZWxzZVxuICAgICAgb25CbHVyKHRoaXMpO1xuXG4gICAgZm9yICh2YXIgb3B0IGluIG9wdGlvbkhhbmRsZXJzKSBpZiAob3B0aW9uSGFuZGxlcnMuaGFzT3duUHJvcGVydHkob3B0KSlcbiAgICAgIG9wdGlvbkhhbmRsZXJzW29wdF0odGhpcywgb3B0aW9uc1tvcHRdLCBJbml0KTtcbiAgICBtYXliZVVwZGF0ZUxpbmVOdW1iZXJXaWR0aCh0aGlzKTtcbiAgICBpZiAob3B0aW9ucy5maW5pc2hJbml0KSBvcHRpb25zLmZpbmlzaEluaXQodGhpcyk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbml0SG9va3MubGVuZ3RoOyArK2kpIGluaXRIb29rc1tpXSh0aGlzKTtcbiAgICBlbmRPcGVyYXRpb24odGhpcyk7XG4gICAgLy8gU3VwcHJlc3Mgb3B0aW1pemVsZWdpYmlsaXR5IGluIFdlYmtpdCwgc2luY2UgaXQgYnJlYWtzIHRleHRcbiAgICAvLyBtZWFzdXJpbmcgb24gbGluZSB3cmFwcGluZyBib3VuZGFyaWVzLlxuICAgIGlmICh3ZWJraXQgJiYgb3B0aW9ucy5saW5lV3JhcHBpbmcgJiZcbiAgICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShkaXNwbGF5LmxpbmVEaXYpLnRleHRSZW5kZXJpbmcgPT0gXCJvcHRpbWl6ZWxlZ2liaWxpdHlcIilcbiAgICAgIGRpc3BsYXkubGluZURpdi5zdHlsZS50ZXh0UmVuZGVyaW5nID0gXCJhdXRvXCI7XG4gIH1cblxuICAvLyBESVNQTEFZIENPTlNUUlVDVE9SXG5cbiAgLy8gVGhlIGRpc3BsYXkgaGFuZGxlcyB0aGUgRE9NIGludGVncmF0aW9uLCBib3RoIGZvciBpbnB1dCByZWFkaW5nXG4gIC8vIGFuZCBjb250ZW50IGRyYXdpbmcuIEl0IGhvbGRzIHJlZmVyZW5jZXMgdG8gRE9NIG5vZGVzIGFuZFxuICAvLyBkaXNwbGF5LXJlbGF0ZWQgc3RhdGUuXG5cbiAgZnVuY3Rpb24gRGlzcGxheShwbGFjZSwgZG9jLCBpbnB1dCkge1xuICAgIHZhciBkID0gdGhpcztcbiAgICB0aGlzLmlucHV0ID0gaW5wdXQ7XG5cbiAgICAvLyBDb3ZlcnMgYm90dG9tLXJpZ2h0IHNxdWFyZSB3aGVuIGJvdGggc2Nyb2xsYmFycyBhcmUgcHJlc2VudC5cbiAgICBkLnNjcm9sbGJhckZpbGxlciA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3Itc2Nyb2xsYmFyLWZpbGxlclwiKTtcbiAgICBkLnNjcm9sbGJhckZpbGxlci5zZXRBdHRyaWJ1dGUoXCJjbS1ub3QtY29udGVudFwiLCBcInRydWVcIik7XG4gICAgLy8gQ292ZXJzIGJvdHRvbSBvZiBndXR0ZXIgd2hlbiBjb3Zlckd1dHRlck5leHRUb1Njcm9sbGJhciBpcyBvblxuICAgIC8vIGFuZCBoIHNjcm9sbGJhciBpcyBwcmVzZW50LlxuICAgIGQuZ3V0dGVyRmlsbGVyID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1ndXR0ZXItZmlsbGVyXCIpO1xuICAgIGQuZ3V0dGVyRmlsbGVyLnNldEF0dHJpYnV0ZShcImNtLW5vdC1jb250ZW50XCIsIFwidHJ1ZVwiKTtcbiAgICAvLyBXaWxsIGNvbnRhaW4gdGhlIGFjdHVhbCBjb2RlLCBwb3NpdGlvbmVkIHRvIGNvdmVyIHRoZSB2aWV3cG9ydC5cbiAgICBkLmxpbmVEaXYgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWNvZGVcIik7XG4gICAgLy8gRWxlbWVudHMgYXJlIGFkZGVkIHRvIHRoZXNlIHRvIHJlcHJlc2VudCBzZWxlY3Rpb24gYW5kIGN1cnNvcnMuXG4gICAgZC5zZWxlY3Rpb25EaXYgPSBlbHQoXCJkaXZcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogcmVsYXRpdmU7IHotaW5kZXg6IDFcIik7XG4gICAgZC5jdXJzb3JEaXYgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWN1cnNvcnNcIik7XG4gICAgLy8gQSB2aXNpYmlsaXR5OiBoaWRkZW4gZWxlbWVudCB1c2VkIHRvIGZpbmQgdGhlIHNpemUgb2YgdGhpbmdzLlxuICAgIGQubWVhc3VyZSA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItbWVhc3VyZVwiKTtcbiAgICAvLyBXaGVuIGxpbmVzIG91dHNpZGUgb2YgdGhlIHZpZXdwb3J0IGFyZSBtZWFzdXJlZCwgdGhleSBhcmUgZHJhd24gaW4gdGhpcy5cbiAgICBkLmxpbmVNZWFzdXJlID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1tZWFzdXJlXCIpO1xuICAgIC8vIFdyYXBzIGV2ZXJ5dGhpbmcgdGhhdCBuZWVkcyB0byBleGlzdCBpbnNpZGUgdGhlIHZlcnRpY2FsbHktcGFkZGVkIGNvb3JkaW5hdGUgc3lzdGVtXG4gICAgZC5saW5lU3BhY2UgPSBlbHQoXCJkaXZcIiwgW2QubWVhc3VyZSwgZC5saW5lTWVhc3VyZSwgZC5zZWxlY3Rpb25EaXYsIGQuY3Vyc29yRGl2LCBkLmxpbmVEaXZdLFxuICAgICAgICAgICAgICAgICAgICAgIG51bGwsIFwicG9zaXRpb246IHJlbGF0aXZlOyBvdXRsaW5lOiBub25lXCIpO1xuICAgIC8vIE1vdmVkIGFyb3VuZCBpdHMgcGFyZW50IHRvIGNvdmVyIHZpc2libGUgdmlldy5cbiAgICBkLm1vdmVyID0gZWx0KFwiZGl2XCIsIFtlbHQoXCJkaXZcIiwgW2QubGluZVNwYWNlXSwgXCJDb2RlTWlycm9yLWxpbmVzXCIpXSwgbnVsbCwgXCJwb3NpdGlvbjogcmVsYXRpdmVcIik7XG4gICAgLy8gU2V0IHRvIHRoZSBoZWlnaHQgb2YgdGhlIGRvY3VtZW50LCBhbGxvd2luZyBzY3JvbGxpbmcuXG4gICAgZC5zaXplciA9IGVsdChcImRpdlwiLCBbZC5tb3Zlcl0sIFwiQ29kZU1pcnJvci1zaXplclwiKTtcbiAgICBkLnNpemVyV2lkdGggPSBudWxsO1xuICAgIC8vIEJlaGF2aW9yIG9mIGVsdHMgd2l0aCBvdmVyZmxvdzogYXV0byBhbmQgcGFkZGluZyBpc1xuICAgIC8vIGluY29uc2lzdGVudCBhY3Jvc3MgYnJvd3NlcnMuIFRoaXMgaXMgdXNlZCB0byBlbnN1cmUgdGhlXG4gICAgLy8gc2Nyb2xsYWJsZSBhcmVhIGlzIGJpZyBlbm91Z2guXG4gICAgZC5oZWlnaHRGb3JjZXIgPSBlbHQoXCJkaXZcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogYWJzb2x1dGU7IGhlaWdodDogXCIgKyBzY3JvbGxlckdhcCArIFwicHg7IHdpZHRoOiAxcHg7XCIpO1xuICAgIC8vIFdpbGwgY29udGFpbiB0aGUgZ3V0dGVycywgaWYgYW55LlxuICAgIGQuZ3V0dGVycyA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyc1wiKTtcbiAgICBkLmxpbmVHdXR0ZXIgPSBudWxsO1xuICAgIC8vIEFjdHVhbCBzY3JvbGxhYmxlIGVsZW1lbnQuXG4gICAgZC5zY3JvbGxlciA9IGVsdChcImRpdlwiLCBbZC5zaXplciwgZC5oZWlnaHRGb3JjZXIsIGQuZ3V0dGVyc10sIFwiQ29kZU1pcnJvci1zY3JvbGxcIik7XG4gICAgZC5zY3JvbGxlci5zZXRBdHRyaWJ1dGUoXCJ0YWJJbmRleFwiLCBcIi0xXCIpO1xuICAgIC8vIFRoZSBlbGVtZW50IGluIHdoaWNoIHRoZSBlZGl0b3IgbGl2ZXMuXG4gICAgZC53cmFwcGVyID0gZWx0KFwiZGl2XCIsIFtkLnNjcm9sbGJhckZpbGxlciwgZC5ndXR0ZXJGaWxsZXIsIGQuc2Nyb2xsZXJdLCBcIkNvZGVNaXJyb3JcIik7XG5cbiAgICAvLyBXb3JrIGFyb3VuZCBJRTcgei1pbmRleCBidWcgKG5vdCBwZXJmZWN0LCBoZW5jZSBJRTcgbm90IHJlYWxseSBiZWluZyBzdXBwb3J0ZWQpXG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA4KSB7IGQuZ3V0dGVycy5zdHlsZS56SW5kZXggPSAtMTsgZC5zY3JvbGxlci5zdHlsZS5wYWRkaW5nUmlnaHQgPSAwOyB9XG4gICAgaWYgKCF3ZWJraXQgJiYgIShnZWNrbyAmJiBtb2JpbGUpKSBkLnNjcm9sbGVyLmRyYWdnYWJsZSA9IHRydWU7XG5cbiAgICBpZiAocGxhY2UpIHtcbiAgICAgIGlmIChwbGFjZS5hcHBlbmRDaGlsZCkgcGxhY2UuYXBwZW5kQ2hpbGQoZC53cmFwcGVyKTtcbiAgICAgIGVsc2UgcGxhY2UoZC53cmFwcGVyKTtcbiAgICB9XG5cbiAgICAvLyBDdXJyZW50IHJlbmRlcmVkIHJhbmdlIChtYXkgYmUgYmlnZ2VyIHRoYW4gdGhlIHZpZXcgd2luZG93KS5cbiAgICBkLnZpZXdGcm9tID0gZC52aWV3VG8gPSBkb2MuZmlyc3Q7XG4gICAgZC5yZXBvcnRlZFZpZXdGcm9tID0gZC5yZXBvcnRlZFZpZXdUbyA9IGRvYy5maXJzdDtcbiAgICAvLyBJbmZvcm1hdGlvbiBhYm91dCB0aGUgcmVuZGVyZWQgbGluZXMuXG4gICAgZC52aWV3ID0gW107XG4gICAgZC5yZW5kZXJlZFZpZXcgPSBudWxsO1xuICAgIC8vIEhvbGRzIGluZm8gYWJvdXQgYSBzaW5nbGUgcmVuZGVyZWQgbGluZSB3aGVuIGl0IHdhcyByZW5kZXJlZFxuICAgIC8vIGZvciBtZWFzdXJlbWVudCwgd2hpbGUgbm90IGluIHZpZXcuXG4gICAgZC5leHRlcm5hbE1lYXN1cmVkID0gbnVsbDtcbiAgICAvLyBFbXB0eSBzcGFjZSAoaW4gcGl4ZWxzKSBhYm92ZSB0aGUgdmlld1xuICAgIGQudmlld09mZnNldCA9IDA7XG4gICAgZC5sYXN0V3JhcEhlaWdodCA9IGQubGFzdFdyYXBXaWR0aCA9IDA7XG4gICAgZC51cGRhdGVMaW5lTnVtYmVycyA9IG51bGw7XG5cbiAgICBkLm5hdGl2ZUJhcldpZHRoID0gZC5iYXJIZWlnaHQgPSBkLmJhcldpZHRoID0gMDtcbiAgICBkLnNjcm9sbGJhcnNDbGlwcGVkID0gZmFsc2U7XG5cbiAgICAvLyBVc2VkIHRvIG9ubHkgcmVzaXplIHRoZSBsaW5lIG51bWJlciBndXR0ZXIgd2hlbiBuZWNlc3NhcnkgKHdoZW5cbiAgICAvLyB0aGUgYW1vdW50IG9mIGxpbmVzIGNyb3NzZXMgYSBib3VuZGFyeSB0aGF0IG1ha2VzIGl0cyB3aWR0aCBjaGFuZ2UpXG4gICAgZC5saW5lTnVtV2lkdGggPSBkLmxpbmVOdW1Jbm5lcldpZHRoID0gZC5saW5lTnVtQ2hhcnMgPSBudWxsO1xuICAgIC8vIFNldCB0byB0cnVlIHdoZW4gYSBub24taG9yaXpvbnRhbC1zY3JvbGxpbmcgbGluZSB3aWRnZXQgaXNcbiAgICAvLyBhZGRlZC4gQXMgYW4gb3B0aW1pemF0aW9uLCBsaW5lIHdpZGdldCBhbGlnbmluZyBpcyBza2lwcGVkIHdoZW5cbiAgICAvLyB0aGlzIGlzIGZhbHNlLlxuICAgIGQuYWxpZ25XaWRnZXRzID0gZmFsc2U7XG5cbiAgICBkLmNhY2hlZENoYXJXaWR0aCA9IGQuY2FjaGVkVGV4dEhlaWdodCA9IGQuY2FjaGVkUGFkZGluZ0ggPSBudWxsO1xuXG4gICAgLy8gVHJhY2tzIHRoZSBtYXhpbXVtIGxpbmUgbGVuZ3RoIHNvIHRoYXQgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyXG4gICAgLy8gY2FuIGJlIGtlcHQgc3RhdGljIHdoZW4gc2Nyb2xsaW5nLlxuICAgIGQubWF4TGluZSA9IG51bGw7XG4gICAgZC5tYXhMaW5lTGVuZ3RoID0gMDtcbiAgICBkLm1heExpbmVDaGFuZ2VkID0gZmFsc2U7XG5cbiAgICAvLyBVc2VkIGZvciBtZWFzdXJpbmcgd2hlZWwgc2Nyb2xsaW5nIGdyYW51bGFyaXR5XG4gICAgZC53aGVlbERYID0gZC53aGVlbERZID0gZC53aGVlbFN0YXJ0WCA9IGQud2hlZWxTdGFydFkgPSBudWxsO1xuXG4gICAgLy8gVHJ1ZSB3aGVuIHNoaWZ0IGlzIGhlbGQgZG93bi5cbiAgICBkLnNoaWZ0ID0gZmFsc2U7XG5cbiAgICAvLyBVc2VkIHRvIHRyYWNrIHdoZXRoZXIgYW55dGhpbmcgaGFwcGVuZWQgc2luY2UgdGhlIGNvbnRleHQgbWVudVxuICAgIC8vIHdhcyBvcGVuZWQuXG4gICAgZC5zZWxGb3JDb250ZXh0TWVudSA9IG51bGw7XG5cbiAgICBkLmFjdGl2ZVRvdWNoID0gbnVsbDtcblxuICAgIGlucHV0LmluaXQoZCk7XG4gIH1cblxuICAvLyBTVEFURSBVUERBVEVTXG5cbiAgLy8gVXNlZCB0byBnZXQgdGhlIGVkaXRvciBpbnRvIGEgY29uc2lzdGVudCBzdGF0ZSBhZ2FpbiB3aGVuIG9wdGlvbnMgY2hhbmdlLlxuXG4gIGZ1bmN0aW9uIGxvYWRNb2RlKGNtKSB7XG4gICAgY20uZG9jLm1vZGUgPSBDb2RlTWlycm9yLmdldE1vZGUoY20ub3B0aW9ucywgY20uZG9jLm1vZGVPcHRpb24pO1xuICAgIHJlc2V0TW9kZVN0YXRlKGNtKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlc2V0TW9kZVN0YXRlKGNtKSB7XG4gICAgY20uZG9jLml0ZXIoZnVuY3Rpb24obGluZSkge1xuICAgICAgaWYgKGxpbmUuc3RhdGVBZnRlcikgbGluZS5zdGF0ZUFmdGVyID0gbnVsbDtcbiAgICAgIGlmIChsaW5lLnN0eWxlcykgbGluZS5zdHlsZXMgPSBudWxsO1xuICAgIH0pO1xuICAgIGNtLmRvYy5mcm9udGllciA9IGNtLmRvYy5maXJzdDtcbiAgICBzdGFydFdvcmtlcihjbSwgMTAwKTtcbiAgICBjbS5zdGF0ZS5tb2RlR2VuKys7XG4gICAgaWYgKGNtLmN1ck9wKSByZWdDaGFuZ2UoY20pO1xuICB9XG5cbiAgZnVuY3Rpb24gd3JhcHBpbmdDaGFuZ2VkKGNtKSB7XG4gICAgaWYgKGNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7XG4gICAgICBhZGRDbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIFwiQ29kZU1pcnJvci13cmFwXCIpO1xuICAgICAgY20uZGlzcGxheS5zaXplci5zdHlsZS5taW5XaWR0aCA9IFwiXCI7XG4gICAgICBjbS5kaXNwbGF5LnNpemVyV2lkdGggPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBybUNsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgXCJDb2RlTWlycm9yLXdyYXBcIik7XG4gICAgICBmaW5kTWF4TGluZShjbSk7XG4gICAgfVxuICAgIGVzdGltYXRlTGluZUhlaWdodHMoY20pO1xuICAgIHJlZ0NoYW5nZShjbSk7XG4gICAgY2xlYXJDYWNoZXMoY20pO1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXt1cGRhdGVTY3JvbGxiYXJzKGNtKTt9LCAxMDApO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgZXN0aW1hdGVzIHRoZSBoZWlnaHQgb2YgYSBsaW5lLCB0byB1c2UgYXNcbiAgLy8gZmlyc3QgYXBwcm94aW1hdGlvbiB1bnRpbCB0aGUgbGluZSBiZWNvbWVzIHZpc2libGUgKGFuZCBpcyB0aHVzXG4gIC8vIHByb3Blcmx5IG1lYXN1cmFibGUpLlxuICBmdW5jdGlvbiBlc3RpbWF0ZUhlaWdodChjbSkge1xuICAgIHZhciB0aCA9IHRleHRIZWlnaHQoY20uZGlzcGxheSksIHdyYXBwaW5nID0gY20ub3B0aW9ucy5saW5lV3JhcHBpbmc7XG4gICAgdmFyIHBlckxpbmUgPSB3cmFwcGluZyAmJiBNYXRoLm1heCg1LCBjbS5kaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoIC8gY2hhcldpZHRoKGNtLmRpc3BsYXkpIC0gMyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIGlmIChsaW5lSXNIaWRkZW4oY20uZG9jLCBsaW5lKSkgcmV0dXJuIDA7XG5cbiAgICAgIHZhciB3aWRnZXRzSGVpZ2h0ID0gMDtcbiAgICAgIGlmIChsaW5lLndpZGdldHMpIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZS53aWRnZXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChsaW5lLndpZGdldHNbaV0uaGVpZ2h0KSB3aWRnZXRzSGVpZ2h0ICs9IGxpbmUud2lkZ2V0c1tpXS5oZWlnaHQ7XG4gICAgICB9XG5cbiAgICAgIGlmICh3cmFwcGluZylcbiAgICAgICAgcmV0dXJuIHdpZGdldHNIZWlnaHQgKyAoTWF0aC5jZWlsKGxpbmUudGV4dC5sZW5ndGggLyBwZXJMaW5lKSB8fCAxKSAqIHRoO1xuICAgICAgZWxzZVxuICAgICAgICByZXR1cm4gd2lkZ2V0c0hlaWdodCArIHRoO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBlc3RpbWF0ZUxpbmVIZWlnaHRzKGNtKSB7XG4gICAgdmFyIGRvYyA9IGNtLmRvYywgZXN0ID0gZXN0aW1hdGVIZWlnaHQoY20pO1xuICAgIGRvYy5pdGVyKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIHZhciBlc3RIZWlnaHQgPSBlc3QobGluZSk7XG4gICAgICBpZiAoZXN0SGVpZ2h0ICE9IGxpbmUuaGVpZ2h0KSB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGVzdEhlaWdodCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB0aGVtZUNoYW5nZWQoY20pIHtcbiAgICBjbS5kaXNwbGF5LndyYXBwZXIuY2xhc3NOYW1lID0gY20uZGlzcGxheS53cmFwcGVyLmNsYXNzTmFtZS5yZXBsYWNlKC9cXHMqY20tcy1cXFMrL2csIFwiXCIpICtcbiAgICAgIGNtLm9wdGlvbnMudGhlbWUucmVwbGFjZSgvKF58XFxzKVxccyovZywgXCIgY20tcy1cIik7XG4gICAgY2xlYXJDYWNoZXMoY20pO1xuICB9XG5cbiAgZnVuY3Rpb24gZ3V0dGVyc0NoYW5nZWQoY20pIHtcbiAgICB1cGRhdGVHdXR0ZXJzKGNtKTtcbiAgICByZWdDaGFuZ2UoY20pO1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXthbGlnbkhvcml6b250YWxseShjbSk7fSwgMjApO1xuICB9XG5cbiAgLy8gUmVidWlsZCB0aGUgZ3V0dGVyIGVsZW1lbnRzLCBlbnN1cmUgdGhlIG1hcmdpbiB0byB0aGUgbGVmdCBvZiB0aGVcbiAgLy8gY29kZSBtYXRjaGVzIHRoZWlyIHdpZHRoLlxuICBmdW5jdGlvbiB1cGRhdGVHdXR0ZXJzKGNtKSB7XG4gICAgdmFyIGd1dHRlcnMgPSBjbS5kaXNwbGF5Lmd1dHRlcnMsIHNwZWNzID0gY20ub3B0aW9ucy5ndXR0ZXJzO1xuICAgIHJlbW92ZUNoaWxkcmVuKGd1dHRlcnMpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3BlY3MubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBndXR0ZXJDbGFzcyA9IHNwZWNzW2ldO1xuICAgICAgdmFyIGdFbHQgPSBndXR0ZXJzLmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyIFwiICsgZ3V0dGVyQ2xhc3MpKTtcbiAgICAgIGlmIChndXR0ZXJDbGFzcyA9PSBcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIikge1xuICAgICAgICBjbS5kaXNwbGF5LmxpbmVHdXR0ZXIgPSBnRWx0O1xuICAgICAgICBnRWx0LnN0eWxlLndpZHRoID0gKGNtLmRpc3BsYXkubGluZU51bVdpZHRoIHx8IDEpICsgXCJweFwiO1xuICAgICAgfVxuICAgIH1cbiAgICBndXR0ZXJzLnN0eWxlLmRpc3BsYXkgPSBpID8gXCJcIiA6IFwibm9uZVwiO1xuICAgIHVwZGF0ZUd1dHRlclNwYWNlKGNtKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZUd1dHRlclNwYWNlKGNtKSB7XG4gICAgdmFyIHdpZHRoID0gY20uZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoO1xuICAgIGNtLmRpc3BsYXkuc2l6ZXIuc3R5bGUubWFyZ2luTGVmdCA9IHdpZHRoICsgXCJweFwiO1xuICB9XG5cbiAgLy8gQ29tcHV0ZSB0aGUgY2hhcmFjdGVyIGxlbmd0aCBvZiBhIGxpbmUsIHRha2luZyBpbnRvIGFjY291bnRcbiAgLy8gY29sbGFwc2VkIHJhbmdlcyAoc2VlIG1hcmtUZXh0KSB0aGF0IG1pZ2h0IGhpZGUgcGFydHMsIGFuZCBqb2luXG4gIC8vIG90aGVyIGxpbmVzIG9udG8gaXQuXG4gIGZ1bmN0aW9uIGxpbmVMZW5ndGgobGluZSkge1xuICAgIGlmIChsaW5lLmhlaWdodCA9PSAwKSByZXR1cm4gMDtcbiAgICB2YXIgbGVuID0gbGluZS50ZXh0Lmxlbmd0aCwgbWVyZ2VkLCBjdXIgPSBsaW5lO1xuICAgIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRTdGFydChjdXIpKSB7XG4gICAgICB2YXIgZm91bmQgPSBtZXJnZWQuZmluZCgwLCB0cnVlKTtcbiAgICAgIGN1ciA9IGZvdW5kLmZyb20ubGluZTtcbiAgICAgIGxlbiArPSBmb3VuZC5mcm9tLmNoIC0gZm91bmQudG8uY2g7XG4gICAgfVxuICAgIGN1ciA9IGxpbmU7XG4gICAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdEVuZChjdXIpKSB7XG4gICAgICB2YXIgZm91bmQgPSBtZXJnZWQuZmluZCgwLCB0cnVlKTtcbiAgICAgIGxlbiAtPSBjdXIudGV4dC5sZW5ndGggLSBmb3VuZC5mcm9tLmNoO1xuICAgICAgY3VyID0gZm91bmQudG8ubGluZTtcbiAgICAgIGxlbiArPSBjdXIudGV4dC5sZW5ndGggLSBmb3VuZC50by5jaDtcbiAgICB9XG4gICAgcmV0dXJuIGxlbjtcbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxvbmdlc3QgbGluZSBpbiB0aGUgZG9jdW1lbnQuXG4gIGZ1bmN0aW9uIGZpbmRNYXhMaW5lKGNtKSB7XG4gICAgdmFyIGQgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gICAgZC5tYXhMaW5lID0gZ2V0TGluZShkb2MsIGRvYy5maXJzdCk7XG4gICAgZC5tYXhMaW5lTGVuZ3RoID0gbGluZUxlbmd0aChkLm1heExpbmUpO1xuICAgIGQubWF4TGluZUNoYW5nZWQgPSB0cnVlO1xuICAgIGRvYy5pdGVyKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIHZhciBsZW4gPSBsaW5lTGVuZ3RoKGxpbmUpO1xuICAgICAgaWYgKGxlbiA+IGQubWF4TGluZUxlbmd0aCkge1xuICAgICAgICBkLm1heExpbmVMZW5ndGggPSBsZW47XG4gICAgICAgIGQubWF4TGluZSA9IGxpbmU7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBNYWtlIHN1cmUgdGhlIGd1dHRlcnMgb3B0aW9ucyBjb250YWlucyB0aGUgZWxlbWVudFxuICAvLyBcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIiB3aGVuIHRoZSBsaW5lTnVtYmVycyBvcHRpb24gaXMgdHJ1ZS5cbiAgZnVuY3Rpb24gc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKG9wdGlvbnMpIHtcbiAgICB2YXIgZm91bmQgPSBpbmRleE9mKG9wdGlvbnMuZ3V0dGVycywgXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCIpO1xuICAgIGlmIChmb3VuZCA9PSAtMSAmJiBvcHRpb25zLmxpbmVOdW1iZXJzKSB7XG4gICAgICBvcHRpb25zLmd1dHRlcnMgPSBvcHRpb25zLmd1dHRlcnMuY29uY2F0KFtcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIl0pO1xuICAgIH0gZWxzZSBpZiAoZm91bmQgPiAtMSAmJiAhb3B0aW9ucy5saW5lTnVtYmVycykge1xuICAgICAgb3B0aW9ucy5ndXR0ZXJzID0gb3B0aW9ucy5ndXR0ZXJzLnNsaWNlKDApO1xuICAgICAgb3B0aW9ucy5ndXR0ZXJzLnNwbGljZShmb3VuZCwgMSk7XG4gICAgfVxuICB9XG5cbiAgLy8gU0NST0xMQkFSU1xuXG4gIC8vIFByZXBhcmUgRE9NIHJlYWRzIG5lZWRlZCB0byB1cGRhdGUgdGhlIHNjcm9sbGJhcnMuIERvbmUgaW4gb25lXG4gIC8vIHNob3QgdG8gbWluaW1pemUgdXBkYXRlL21lYXN1cmUgcm91bmR0cmlwcy5cbiAgZnVuY3Rpb24gbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pIHtcbiAgICB2YXIgZCA9IGNtLmRpc3BsYXksIGd1dHRlclcgPSBkLmd1dHRlcnMub2Zmc2V0V2lkdGg7XG4gICAgdmFyIGRvY0ggPSBNYXRoLnJvdW5kKGNtLmRvYy5oZWlnaHQgKyBwYWRkaW5nVmVydChjbS5kaXNwbGF5KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNsaWVudEhlaWdodDogZC5zY3JvbGxlci5jbGllbnRIZWlnaHQsXG4gICAgICB2aWV3SGVpZ2h0OiBkLndyYXBwZXIuY2xpZW50SGVpZ2h0LFxuICAgICAgc2Nyb2xsV2lkdGg6IGQuc2Nyb2xsZXIuc2Nyb2xsV2lkdGgsIGNsaWVudFdpZHRoOiBkLnNjcm9sbGVyLmNsaWVudFdpZHRoLFxuICAgICAgdmlld1dpZHRoOiBkLndyYXBwZXIuY2xpZW50V2lkdGgsXG4gICAgICBiYXJMZWZ0OiBjbS5vcHRpb25zLmZpeGVkR3V0dGVyID8gZ3V0dGVyVyA6IDAsXG4gICAgICBkb2NIZWlnaHQ6IGRvY0gsXG4gICAgICBzY3JvbGxIZWlnaHQ6IGRvY0ggKyBzY3JvbGxHYXAoY20pICsgZC5iYXJIZWlnaHQsXG4gICAgICBuYXRpdmVCYXJXaWR0aDogZC5uYXRpdmVCYXJXaWR0aCxcbiAgICAgIGd1dHRlcldpZHRoOiBndXR0ZXJXXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIE5hdGl2ZVNjcm9sbGJhcnMocGxhY2UsIHNjcm9sbCwgY20pIHtcbiAgICB0aGlzLmNtID0gY207XG4gICAgdmFyIHZlcnQgPSB0aGlzLnZlcnQgPSBlbHQoXCJkaXZcIiwgW2VsdChcImRpdlwiLCBudWxsLCBudWxsLCBcIm1pbi13aWR0aDogMXB4XCIpXSwgXCJDb2RlTWlycm9yLXZzY3JvbGxiYXJcIik7XG4gICAgdmFyIGhvcml6ID0gdGhpcy5ob3JpeiA9IGVsdChcImRpdlwiLCBbZWx0KFwiZGl2XCIsIG51bGwsIG51bGwsIFwiaGVpZ2h0OiAxMDAlOyBtaW4taGVpZ2h0OiAxcHhcIildLCBcIkNvZGVNaXJyb3ItaHNjcm9sbGJhclwiKTtcbiAgICBwbGFjZSh2ZXJ0KTsgcGxhY2UoaG9yaXopO1xuXG4gICAgb24odmVydCwgXCJzY3JvbGxcIiwgZnVuY3Rpb24oKSB7XG4gICAgICBpZiAodmVydC5jbGllbnRIZWlnaHQpIHNjcm9sbCh2ZXJ0LnNjcm9sbFRvcCwgXCJ2ZXJ0aWNhbFwiKTtcbiAgICB9KTtcbiAgICBvbihob3JpeiwgXCJzY3JvbGxcIiwgZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoaG9yaXouY2xpZW50V2lkdGgpIHNjcm9sbChob3Jpei5zY3JvbGxMZWZ0LCBcImhvcml6b250YWxcIik7XG4gICAgfSk7XG5cbiAgICB0aGlzLmNoZWNrZWRaZXJvV2lkdGggPSBmYWxzZTtcbiAgICAvLyBOZWVkIHRvIHNldCBhIG1pbmltdW0gd2lkdGggdG8gc2VlIHRoZSBzY3JvbGxiYXIgb24gSUU3IChidXQgbXVzdCBub3Qgc2V0IGl0IG9uIElFOCkuXG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA4KSB0aGlzLmhvcml6LnN0eWxlLm1pbkhlaWdodCA9IHRoaXMudmVydC5zdHlsZS5taW5XaWR0aCA9IFwiMThweFwiO1xuICB9XG5cbiAgTmF0aXZlU2Nyb2xsYmFycy5wcm90b3R5cGUgPSBjb3B5T2JqKHtcbiAgICB1cGRhdGU6IGZ1bmN0aW9uKG1lYXN1cmUpIHtcbiAgICAgIHZhciBuZWVkc0ggPSBtZWFzdXJlLnNjcm9sbFdpZHRoID4gbWVhc3VyZS5jbGllbnRXaWR0aCArIDE7XG4gICAgICB2YXIgbmVlZHNWID0gbWVhc3VyZS5zY3JvbGxIZWlnaHQgPiBtZWFzdXJlLmNsaWVudEhlaWdodCArIDE7XG4gICAgICB2YXIgc1dpZHRoID0gbWVhc3VyZS5uYXRpdmVCYXJXaWR0aDtcblxuICAgICAgaWYgKG5lZWRzVikge1xuICAgICAgICB0aGlzLnZlcnQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICAgdGhpcy52ZXJ0LnN0eWxlLmJvdHRvbSA9IG5lZWRzSCA/IHNXaWR0aCArIFwicHhcIiA6IFwiMFwiO1xuICAgICAgICB2YXIgdG90YWxIZWlnaHQgPSBtZWFzdXJlLnZpZXdIZWlnaHQgLSAobmVlZHNIID8gc1dpZHRoIDogMCk7XG4gICAgICAgIC8vIEEgYnVnIGluIElFOCBjYW4gY2F1c2UgdGhpcyB2YWx1ZSB0byBiZSBuZWdhdGl2ZSwgc28gZ3VhcmQgaXQuXG4gICAgICAgIHRoaXMudmVydC5maXJzdENoaWxkLnN0eWxlLmhlaWdodCA9XG4gICAgICAgICAgTWF0aC5tYXgoMCwgbWVhc3VyZS5zY3JvbGxIZWlnaHQgLSBtZWFzdXJlLmNsaWVudEhlaWdodCArIHRvdGFsSGVpZ2h0KSArIFwicHhcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMudmVydC5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgICAgdGhpcy52ZXJ0LmZpcnN0Q2hpbGQuc3R5bGUuaGVpZ2h0ID0gXCIwXCI7XG4gICAgICB9XG5cbiAgICAgIGlmIChuZWVkc0gpIHtcbiAgICAgICAgdGhpcy5ob3Jpei5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgICB0aGlzLmhvcml6LnN0eWxlLnJpZ2h0ID0gbmVlZHNWID8gc1dpZHRoICsgXCJweFwiIDogXCIwXCI7XG4gICAgICAgIHRoaXMuaG9yaXouc3R5bGUubGVmdCA9IG1lYXN1cmUuYmFyTGVmdCArIFwicHhcIjtcbiAgICAgICAgdmFyIHRvdGFsV2lkdGggPSBtZWFzdXJlLnZpZXdXaWR0aCAtIG1lYXN1cmUuYmFyTGVmdCAtIChuZWVkc1YgPyBzV2lkdGggOiAwKTtcbiAgICAgICAgdGhpcy5ob3Jpei5maXJzdENoaWxkLnN0eWxlLndpZHRoID1cbiAgICAgICAgICAobWVhc3VyZS5zY3JvbGxXaWR0aCAtIG1lYXN1cmUuY2xpZW50V2lkdGggKyB0b3RhbFdpZHRoKSArIFwicHhcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuaG9yaXouc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgICAgIHRoaXMuaG9yaXouZmlyc3RDaGlsZC5zdHlsZS53aWR0aCA9IFwiMFwiO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXRoaXMuY2hlY2tlZFplcm9XaWR0aCAmJiBtZWFzdXJlLmNsaWVudEhlaWdodCA+IDApIHtcbiAgICAgICAgaWYgKHNXaWR0aCA9PSAwKSB0aGlzLnplcm9XaWR0aEhhY2soKTtcbiAgICAgICAgdGhpcy5jaGVja2VkWmVyb1dpZHRoID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtyaWdodDogbmVlZHNWID8gc1dpZHRoIDogMCwgYm90dG9tOiBuZWVkc0ggPyBzV2lkdGggOiAwfTtcbiAgICB9LFxuICAgIHNldFNjcm9sbExlZnQ6IGZ1bmN0aW9uKHBvcykge1xuICAgICAgaWYgKHRoaXMuaG9yaXouc2Nyb2xsTGVmdCAhPSBwb3MpIHRoaXMuaG9yaXouc2Nyb2xsTGVmdCA9IHBvcztcbiAgICAgIGlmICh0aGlzLmRpc2FibGVIb3JpeikgdGhpcy5lbmFibGVaZXJvV2lkdGhCYXIodGhpcy5ob3JpeiwgdGhpcy5kaXNhYmxlSG9yaXopO1xuICAgIH0sXG4gICAgc2V0U2Nyb2xsVG9wOiBmdW5jdGlvbihwb3MpIHtcbiAgICAgIGlmICh0aGlzLnZlcnQuc2Nyb2xsVG9wICE9IHBvcykgdGhpcy52ZXJ0LnNjcm9sbFRvcCA9IHBvcztcbiAgICAgIGlmICh0aGlzLmRpc2FibGVWZXJ0KSB0aGlzLmVuYWJsZVplcm9XaWR0aEJhcih0aGlzLnZlcnQsIHRoaXMuZGlzYWJsZVZlcnQpO1xuICAgIH0sXG4gICAgemVyb1dpZHRoSGFjazogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgdyA9IG1hYyAmJiAhbWFjX2dlTW91bnRhaW5MaW9uID8gXCIxMnB4XCIgOiBcIjE4cHhcIjtcbiAgICAgIHRoaXMuaG9yaXouc3R5bGUuaGVpZ2h0ID0gdGhpcy52ZXJ0LnN0eWxlLndpZHRoID0gdztcbiAgICAgIHRoaXMuaG9yaXouc3R5bGUucG9pbnRlckV2ZW50cyA9IHRoaXMudmVydC5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7XG4gICAgICB0aGlzLmRpc2FibGVIb3JpeiA9IG5ldyBEZWxheWVkO1xuICAgICAgdGhpcy5kaXNhYmxlVmVydCA9IG5ldyBEZWxheWVkO1xuICAgIH0sXG4gICAgZW5hYmxlWmVyb1dpZHRoQmFyOiBmdW5jdGlvbihiYXIsIGRlbGF5KSB7XG4gICAgICBiYXIuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwiYXV0b1wiO1xuICAgICAgZnVuY3Rpb24gbWF5YmVEaXNhYmxlKCkge1xuICAgICAgICAvLyBUbyBmaW5kIG91dCB3aGV0aGVyIHRoZSBzY3JvbGxiYXIgaXMgc3RpbGwgdmlzaWJsZSwgd2VcbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciB0aGUgZWxlbWVudCB1bmRlciB0aGUgcGl4ZWwgaW4gdGhlIGJvdHRvbVxuICAgICAgICAvLyBsZWZ0IGNvcm5lciBvZiB0aGUgc2Nyb2xsYmFyIGJveCBpcyB0aGUgc2Nyb2xsYmFyIGJveFxuICAgICAgICAvLyBpdHNlbGYgKHdoZW4gdGhlIGJhciBpcyBzdGlsbCB2aXNpYmxlKSBvciBpdHMgZmlsbGVyIGNoaWxkXG4gICAgICAgIC8vICh3aGVuIHRoZSBiYXIgaXMgaGlkZGVuKS4gSWYgaXQgaXMgc3RpbGwgdmlzaWJsZSwgd2Uga2VlcFxuICAgICAgICAvLyBpdCBlbmFibGVkLCBpZiBpdCdzIGhpZGRlbiwgd2UgZGlzYWJsZSBwb2ludGVyIGV2ZW50cy5cbiAgICAgICAgdmFyIGJveCA9IGJhci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgdmFyIGVsdCA9IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoYm94LmxlZnQgKyAxLCBib3guYm90dG9tIC0gMSk7XG4gICAgICAgIGlmIChlbHQgIT0gYmFyKSBiYXIuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwibm9uZVwiO1xuICAgICAgICBlbHNlIGRlbGF5LnNldCgxMDAwLCBtYXliZURpc2FibGUpO1xuICAgICAgfVxuICAgICAgZGVsYXkuc2V0KDEwMDAsIG1heWJlRGlzYWJsZSk7XG4gICAgfSxcbiAgICBjbGVhcjogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcGFyZW50ID0gdGhpcy5ob3Jpei5wYXJlbnROb2RlO1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKHRoaXMuaG9yaXopO1xuICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKHRoaXMudmVydCk7XG4gICAgfVxuICB9LCBOYXRpdmVTY3JvbGxiYXJzLnByb3RvdHlwZSk7XG5cbiAgZnVuY3Rpb24gTnVsbFNjcm9sbGJhcnMoKSB7fVxuXG4gIE51bGxTY3JvbGxiYXJzLnByb3RvdHlwZSA9IGNvcHlPYmooe1xuICAgIHVwZGF0ZTogZnVuY3Rpb24oKSB7IHJldHVybiB7Ym90dG9tOiAwLCByaWdodDogMH07IH0sXG4gICAgc2V0U2Nyb2xsTGVmdDogZnVuY3Rpb24oKSB7fSxcbiAgICBzZXRTY3JvbGxUb3A6IGZ1bmN0aW9uKCkge30sXG4gICAgY2xlYXI6IGZ1bmN0aW9uKCkge31cbiAgfSwgTnVsbFNjcm9sbGJhcnMucHJvdG90eXBlKTtcblxuICBDb2RlTWlycm9yLnNjcm9sbGJhck1vZGVsID0ge1wibmF0aXZlXCI6IE5hdGl2ZVNjcm9sbGJhcnMsIFwibnVsbFwiOiBOdWxsU2Nyb2xsYmFyc307XG5cbiAgZnVuY3Rpb24gaW5pdFNjcm9sbGJhcnMoY20pIHtcbiAgICBpZiAoY20uZGlzcGxheS5zY3JvbGxiYXJzKSB7XG4gICAgICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuY2xlYXIoKTtcbiAgICAgIGlmIChjbS5kaXNwbGF5LnNjcm9sbGJhcnMuYWRkQ2xhc3MpXG4gICAgICAgIHJtQ2xhc3MoY20uZGlzcGxheS53cmFwcGVyLCBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuYWRkQ2xhc3MpO1xuICAgIH1cblxuICAgIGNtLmRpc3BsYXkuc2Nyb2xsYmFycyA9IG5ldyBDb2RlTWlycm9yLnNjcm9sbGJhck1vZGVsW2NtLm9wdGlvbnMuc2Nyb2xsYmFyU3R5bGVdKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgIGNtLmRpc3BsYXkud3JhcHBlci5pbnNlcnRCZWZvcmUobm9kZSwgY20uZGlzcGxheS5zY3JvbGxiYXJGaWxsZXIpO1xuICAgICAgLy8gUHJldmVudCBjbGlja3MgaW4gdGhlIHNjcm9sbGJhcnMgZnJvbSBraWxsaW5nIGZvY3VzXG4gICAgICBvbihub2RlLCBcIm1vdXNlZG93blwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKGNtLnN0YXRlLmZvY3VzZWQpIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IGNtLmRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgfSwgMCk7XG4gICAgICB9KTtcbiAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwiY20tbm90LWNvbnRlbnRcIiwgXCJ0cnVlXCIpO1xuICAgIH0sIGZ1bmN0aW9uKHBvcywgYXhpcykge1xuICAgICAgaWYgKGF4aXMgPT0gXCJob3Jpem9udGFsXCIpIHNldFNjcm9sbExlZnQoY20sIHBvcyk7XG4gICAgICBlbHNlIHNldFNjcm9sbFRvcChjbSwgcG9zKTtcbiAgICB9LCBjbSk7XG4gICAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5hZGRDbGFzcylcbiAgICAgIGFkZENsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgY20uZGlzcGxheS5zY3JvbGxiYXJzLmFkZENsYXNzKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHVwZGF0ZVNjcm9sbGJhcnMoY20sIG1lYXN1cmUpIHtcbiAgICBpZiAoIW1lYXN1cmUpIG1lYXN1cmUgPSBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSk7XG4gICAgdmFyIHN0YXJ0V2lkdGggPSBjbS5kaXNwbGF5LmJhcldpZHRoLCBzdGFydEhlaWdodCA9IGNtLmRpc3BsYXkuYmFySGVpZ2h0O1xuICAgIHVwZGF0ZVNjcm9sbGJhcnNJbm5lcihjbSwgbWVhc3VyZSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA0ICYmIHN0YXJ0V2lkdGggIT0gY20uZGlzcGxheS5iYXJXaWR0aCB8fCBzdGFydEhlaWdodCAhPSBjbS5kaXNwbGF5LmJhckhlaWdodDsgaSsrKSB7XG4gICAgICBpZiAoc3RhcnRXaWR0aCAhPSBjbS5kaXNwbGF5LmJhcldpZHRoICYmIGNtLm9wdGlvbnMubGluZVdyYXBwaW5nKVxuICAgICAgICB1cGRhdGVIZWlnaHRzSW5WaWV3cG9ydChjbSk7XG4gICAgICB1cGRhdGVTY3JvbGxiYXJzSW5uZXIoY20sIG1lYXN1cmVGb3JTY3JvbGxiYXJzKGNtKSk7XG4gICAgICBzdGFydFdpZHRoID0gY20uZGlzcGxheS5iYXJXaWR0aDsgc3RhcnRIZWlnaHQgPSBjbS5kaXNwbGF5LmJhckhlaWdodDtcbiAgICB9XG4gIH1cblxuICAvLyBSZS1zeW5jaHJvbml6ZSB0aGUgZmFrZSBzY3JvbGxiYXJzIHdpdGggdGhlIGFjdHVhbCBzaXplIG9mIHRoZVxuICAvLyBjb250ZW50LlxuICBmdW5jdGlvbiB1cGRhdGVTY3JvbGxiYXJzSW5uZXIoY20sIG1lYXN1cmUpIHtcbiAgICB2YXIgZCA9IGNtLmRpc3BsYXk7XG4gICAgdmFyIHNpemVzID0gZC5zY3JvbGxiYXJzLnVwZGF0ZShtZWFzdXJlKTtcblxuICAgIGQuc2l6ZXIuc3R5bGUucGFkZGluZ1JpZ2h0ID0gKGQuYmFyV2lkdGggPSBzaXplcy5yaWdodCkgKyBcInB4XCI7XG4gICAgZC5zaXplci5zdHlsZS5wYWRkaW5nQm90dG9tID0gKGQuYmFySGVpZ2h0ID0gc2l6ZXMuYm90dG9tKSArIFwicHhcIjtcblxuICAgIGlmIChzaXplcy5yaWdodCAmJiBzaXplcy5ib3R0b20pIHtcbiAgICAgIGQuc2Nyb2xsYmFyRmlsbGVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgICBkLnNjcm9sbGJhckZpbGxlci5zdHlsZS5oZWlnaHQgPSBzaXplcy5ib3R0b20gKyBcInB4XCI7XG4gICAgICBkLnNjcm9sbGJhckZpbGxlci5zdHlsZS53aWR0aCA9IHNpemVzLnJpZ2h0ICsgXCJweFwiO1xuICAgIH0gZWxzZSBkLnNjcm9sbGJhckZpbGxlci5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICBpZiAoc2l6ZXMuYm90dG9tICYmIGNtLm9wdGlvbnMuY292ZXJHdXR0ZXJOZXh0VG9TY3JvbGxiYXIgJiYgY20ub3B0aW9ucy5maXhlZEd1dHRlcikge1xuICAgICAgZC5ndXR0ZXJGaWxsZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgIGQuZ3V0dGVyRmlsbGVyLnN0eWxlLmhlaWdodCA9IHNpemVzLmJvdHRvbSArIFwicHhcIjtcbiAgICAgIGQuZ3V0dGVyRmlsbGVyLnN0eWxlLndpZHRoID0gbWVhc3VyZS5ndXR0ZXJXaWR0aCArIFwicHhcIjtcbiAgICB9IGVsc2UgZC5ndXR0ZXJGaWxsZXIuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gIH1cblxuICAvLyBDb21wdXRlIHRoZSBsaW5lcyB0aGF0IGFyZSB2aXNpYmxlIGluIGEgZ2l2ZW4gdmlld3BvcnQgKGRlZmF1bHRzXG4gIC8vIHRoZSB0aGUgY3VycmVudCBzY3JvbGwgcG9zaXRpb24pLiB2aWV3cG9ydCBtYXkgY29udGFpbiB0b3AsXG4gIC8vIGhlaWdodCwgYW5kIGVuc3VyZSAoc2VlIG9wLnNjcm9sbFRvUG9zKSBwcm9wZXJ0aWVzLlxuICBmdW5jdGlvbiB2aXNpYmxlTGluZXMoZGlzcGxheSwgZG9jLCB2aWV3cG9ydCkge1xuICAgIHZhciB0b3AgPSB2aWV3cG9ydCAmJiB2aWV3cG9ydC50b3AgIT0gbnVsbCA/IE1hdGgubWF4KDAsIHZpZXdwb3J0LnRvcCkgOiBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcDtcbiAgICB0b3AgPSBNYXRoLmZsb29yKHRvcCAtIHBhZGRpbmdUb3AoZGlzcGxheSkpO1xuICAgIHZhciBib3R0b20gPSB2aWV3cG9ydCAmJiB2aWV3cG9ydC5ib3R0b20gIT0gbnVsbCA/IHZpZXdwb3J0LmJvdHRvbSA6IHRvcCArIGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQ7XG5cbiAgICB2YXIgZnJvbSA9IGxpbmVBdEhlaWdodChkb2MsIHRvcCksIHRvID0gbGluZUF0SGVpZ2h0KGRvYywgYm90dG9tKTtcbiAgICAvLyBFbnN1cmUgaXMgYSB7ZnJvbToge2xpbmUsIGNofSwgdG86IHtsaW5lLCBjaH19IG9iamVjdCwgYW5kXG4gICAgLy8gZm9yY2VzIHRob3NlIGxpbmVzIGludG8gdGhlIHZpZXdwb3J0IChpZiBwb3NzaWJsZSkuXG4gICAgaWYgKHZpZXdwb3J0ICYmIHZpZXdwb3J0LmVuc3VyZSkge1xuICAgICAgdmFyIGVuc3VyZUZyb20gPSB2aWV3cG9ydC5lbnN1cmUuZnJvbS5saW5lLCBlbnN1cmVUbyA9IHZpZXdwb3J0LmVuc3VyZS50by5saW5lO1xuICAgICAgaWYgKGVuc3VyZUZyb20gPCBmcm9tKSB7XG4gICAgICAgIGZyb20gPSBlbnN1cmVGcm9tO1xuICAgICAgICB0byA9IGxpbmVBdEhlaWdodChkb2MsIGhlaWdodEF0TGluZShnZXRMaW5lKGRvYywgZW5zdXJlRnJvbSkpICsgZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodCk7XG4gICAgICB9IGVsc2UgaWYgKE1hdGgubWluKGVuc3VyZVRvLCBkb2MubGFzdExpbmUoKSkgPj0gdG8pIHtcbiAgICAgICAgZnJvbSA9IGxpbmVBdEhlaWdodChkb2MsIGhlaWdodEF0TGluZShnZXRMaW5lKGRvYywgZW5zdXJlVG8pKSAtIGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQpO1xuICAgICAgICB0byA9IGVuc3VyZVRvO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge2Zyb206IGZyb20sIHRvOiBNYXRoLm1heCh0bywgZnJvbSArIDEpfTtcbiAgfVxuXG4gIC8vIExJTkUgTlVNQkVSU1xuXG4gIC8vIFJlLWFsaWduIGxpbmUgbnVtYmVycyBhbmQgZ3V0dGVyIG1hcmtzIHRvIGNvbXBlbnNhdGUgZm9yXG4gIC8vIGhvcml6b250YWwgc2Nyb2xsaW5nLlxuICBmdW5jdGlvbiBhbGlnbkhvcml6b250YWxseShjbSkge1xuICAgIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgdmlldyA9IGRpc3BsYXkudmlldztcbiAgICBpZiAoIWRpc3BsYXkuYWxpZ25XaWRnZXRzICYmICghZGlzcGxheS5ndXR0ZXJzLmZpcnN0Q2hpbGQgfHwgIWNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIpKSByZXR1cm47XG4gICAgdmFyIGNvbXAgPSBjb21wZW5zYXRlRm9ySFNjcm9sbChkaXNwbGF5KSAtIGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCArIGNtLmRvYy5zY3JvbGxMZWZ0O1xuICAgIHZhciBndXR0ZXJXID0gZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoLCBsZWZ0ID0gY29tcCArIFwicHhcIjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIGlmICghdmlld1tpXS5oaWRkZW4pIHtcbiAgICAgIGlmIChjbS5vcHRpb25zLmZpeGVkR3V0dGVyICYmIHZpZXdbaV0uZ3V0dGVyKVxuICAgICAgICB2aWV3W2ldLmd1dHRlci5zdHlsZS5sZWZ0ID0gbGVmdDtcbiAgICAgIHZhciBhbGlnbiA9IHZpZXdbaV0uYWxpZ25hYmxlO1xuICAgICAgaWYgKGFsaWduKSBmb3IgKHZhciBqID0gMDsgaiA8IGFsaWduLmxlbmd0aDsgaisrKVxuICAgICAgICBhbGlnbltqXS5zdHlsZS5sZWZ0ID0gbGVmdDtcbiAgICB9XG4gICAgaWYgKGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIpXG4gICAgICBkaXNwbGF5Lmd1dHRlcnMuc3R5bGUubGVmdCA9IChjb21wICsgZ3V0dGVyVykgKyBcInB4XCI7XG4gIH1cblxuICAvLyBVc2VkIHRvIGVuc3VyZSB0aGF0IHRoZSBsaW5lIG51bWJlciBndXR0ZXIgaXMgc3RpbGwgdGhlIHJpZ2h0XG4gIC8vIHNpemUgZm9yIHRoZSBjdXJyZW50IGRvY3VtZW50IHNpemUuIFJldHVybnMgdHJ1ZSB3aGVuIGFuIHVwZGF0ZVxuICAvLyBpcyBuZWVkZWQuXG4gIGZ1bmN0aW9uIG1heWJlVXBkYXRlTGluZU51bWJlcldpZHRoKGNtKSB7XG4gICAgaWYgKCFjbS5vcHRpb25zLmxpbmVOdW1iZXJzKSByZXR1cm4gZmFsc2U7XG4gICAgdmFyIGRvYyA9IGNtLmRvYywgbGFzdCA9IGxpbmVOdW1iZXJGb3IoY20ub3B0aW9ucywgZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxKSwgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gICAgaWYgKGxhc3QubGVuZ3RoICE9IGRpc3BsYXkubGluZU51bUNoYXJzKSB7XG4gICAgICB2YXIgdGVzdCA9IGRpc3BsYXkubWVhc3VyZS5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgW2VsdChcImRpdlwiLCBsYXN0KV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJDb2RlTWlycm9yLWxpbmVudW1iZXIgQ29kZU1pcnJvci1ndXR0ZXItZWx0XCIpKTtcbiAgICAgIHZhciBpbm5lclcgPSB0ZXN0LmZpcnN0Q2hpbGQub2Zmc2V0V2lkdGgsIHBhZGRpbmcgPSB0ZXN0Lm9mZnNldFdpZHRoIC0gaW5uZXJXO1xuICAgICAgZGlzcGxheS5saW5lR3V0dGVyLnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICAgIGRpc3BsYXkubGluZU51bUlubmVyV2lkdGggPSBNYXRoLm1heChpbm5lclcsIGRpc3BsYXkubGluZUd1dHRlci5vZmZzZXRXaWR0aCAtIHBhZGRpbmcpICsgMTtcbiAgICAgIGRpc3BsYXkubGluZU51bVdpZHRoID0gZGlzcGxheS5saW5lTnVtSW5uZXJXaWR0aCArIHBhZGRpbmc7XG4gICAgICBkaXNwbGF5LmxpbmVOdW1DaGFycyA9IGRpc3BsYXkubGluZU51bUlubmVyV2lkdGggPyBsYXN0Lmxlbmd0aCA6IC0xO1xuICAgICAgZGlzcGxheS5saW5lR3V0dGVyLnN0eWxlLndpZHRoID0gZGlzcGxheS5saW5lTnVtV2lkdGggKyBcInB4XCI7XG4gICAgICB1cGRhdGVHdXR0ZXJTcGFjZShjbSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gbGluZU51bWJlckZvcihvcHRpb25zLCBpKSB7XG4gICAgcmV0dXJuIFN0cmluZyhvcHRpb25zLmxpbmVOdW1iZXJGb3JtYXR0ZXIoaSArIG9wdGlvbnMuZmlyc3RMaW5lTnVtYmVyKSk7XG4gIH1cblxuICAvLyBDb21wdXRlcyBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQgKyBkaXNwbGF5Lmd1dHRlcnMub2Zmc2V0V2lkdGgsXG4gIC8vIGJ1dCB1c2luZyBnZXRCb3VuZGluZ0NsaWVudFJlY3QgdG8gZ2V0IGEgc3ViLXBpeGVsLWFjY3VyYXRlXG4gIC8vIHJlc3VsdC5cbiAgZnVuY3Rpb24gY29tcGVuc2F0ZUZvckhTY3JvbGwoZGlzcGxheSkge1xuICAgIHJldHVybiBkaXNwbGF5LnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnQgLSBkaXNwbGF5LnNpemVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnQ7XG4gIH1cblxuICAvLyBESVNQTEFZIERSQVdJTkdcblxuICBmdW5jdGlvbiBEaXNwbGF5VXBkYXRlKGNtLCB2aWV3cG9ydCwgZm9yY2UpIHtcbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG5cbiAgICB0aGlzLnZpZXdwb3J0ID0gdmlld3BvcnQ7XG4gICAgLy8gU3RvcmUgc29tZSB2YWx1ZXMgdGhhdCB3ZSdsbCBuZWVkIGxhdGVyIChidXQgZG9uJ3Qgd2FudCB0byBmb3JjZSBhIHJlbGF5b3V0IGZvcilcbiAgICB0aGlzLnZpc2libGUgPSB2aXNpYmxlTGluZXMoZGlzcGxheSwgY20uZG9jLCB2aWV3cG9ydCk7XG4gICAgdGhpcy5lZGl0b3JJc0hpZGRlbiA9ICFkaXNwbGF5LndyYXBwZXIub2Zmc2V0V2lkdGg7XG4gICAgdGhpcy53cmFwcGVySGVpZ2h0ID0gZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodDtcbiAgICB0aGlzLndyYXBwZXJXaWR0aCA9IGRpc3BsYXkud3JhcHBlci5jbGllbnRXaWR0aDtcbiAgICB0aGlzLm9sZERpc3BsYXlXaWR0aCA9IGRpc3BsYXlXaWR0aChjbSk7XG4gICAgdGhpcy5mb3JjZSA9IGZvcmNlO1xuICAgIHRoaXMuZGltcyA9IGdldERpbWVuc2lvbnMoY20pO1xuICAgIHRoaXMuZXZlbnRzID0gW107XG4gIH1cblxuICBEaXNwbGF5VXBkYXRlLnByb3RvdHlwZS5zaWduYWwgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gICAgaWYgKGhhc0hhbmRsZXIoZW1pdHRlciwgdHlwZSkpXG4gICAgICB0aGlzLmV2ZW50cy5wdXNoKGFyZ3VtZW50cyk7XG4gIH07XG4gIERpc3BsYXlVcGRhdGUucHJvdG90eXBlLmZpbmlzaCA9IGZ1bmN0aW9uKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5ldmVudHMubGVuZ3RoOyBpKyspXG4gICAgICBzaWduYWwuYXBwbHkobnVsbCwgdGhpcy5ldmVudHNbaV0pO1xuICB9O1xuXG4gIGZ1bmN0aW9uIG1heWJlQ2xpcFNjcm9sbGJhcnMoY20pIHtcbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gICAgaWYgKCFkaXNwbGF5LnNjcm9sbGJhcnNDbGlwcGVkICYmIGRpc3BsYXkuc2Nyb2xsZXIub2Zmc2V0V2lkdGgpIHtcbiAgICAgIGRpc3BsYXkubmF0aXZlQmFyV2lkdGggPSBkaXNwbGF5LnNjcm9sbGVyLm9mZnNldFdpZHRoIC0gZGlzcGxheS5zY3JvbGxlci5jbGllbnRXaWR0aDtcbiAgICAgIGRpc3BsYXkuaGVpZ2h0Rm9yY2VyLnN0eWxlLmhlaWdodCA9IHNjcm9sbEdhcChjbSkgKyBcInB4XCI7XG4gICAgICBkaXNwbGF5LnNpemVyLnN0eWxlLm1hcmdpbkJvdHRvbSA9IC1kaXNwbGF5Lm5hdGl2ZUJhcldpZHRoICsgXCJweFwiO1xuICAgICAgZGlzcGxheS5zaXplci5zdHlsZS5ib3JkZXJSaWdodFdpZHRoID0gc2Nyb2xsR2FwKGNtKSArIFwicHhcIjtcbiAgICAgIGRpc3BsYXkuc2Nyb2xsYmFyc0NsaXBwZWQgPSB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIC8vIERvZXMgdGhlIGFjdHVhbCB1cGRhdGluZyBvZiB0aGUgbGluZSBkaXNwbGF5LiBCYWlscyBvdXRcbiAgLy8gKHJldHVybmluZyBmYWxzZSkgd2hlbiB0aGVyZSBpcyBub3RoaW5nIHRvIGJlIGRvbmUgYW5kIGZvcmNlZCBpc1xuICAvLyBmYWxzZS5cbiAgZnVuY3Rpb24gdXBkYXRlRGlzcGxheUlmTmVlZGVkKGNtLCB1cGRhdGUpIHtcbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIGRvYyA9IGNtLmRvYztcblxuICAgIGlmICh1cGRhdGUuZWRpdG9ySXNIaWRkZW4pIHtcbiAgICAgIHJlc2V0VmlldyhjbSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gQmFpbCBvdXQgaWYgdGhlIHZpc2libGUgYXJlYSBpcyBhbHJlYWR5IHJlbmRlcmVkIGFuZCBub3RoaW5nIGNoYW5nZWQuXG4gICAgaWYgKCF1cGRhdGUuZm9yY2UgJiZcbiAgICAgICAgdXBkYXRlLnZpc2libGUuZnJvbSA+PSBkaXNwbGF5LnZpZXdGcm9tICYmIHVwZGF0ZS52aXNpYmxlLnRvIDw9IGRpc3BsYXkudmlld1RvICYmXG4gICAgICAgIChkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID09IG51bGwgfHwgZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA+PSBkaXNwbGF5LnZpZXdUbykgJiZcbiAgICAgICAgZGlzcGxheS5yZW5kZXJlZFZpZXcgPT0gZGlzcGxheS52aWV3ICYmIGNvdW50RGlydHlWaWV3KGNtKSA9PSAwKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgaWYgKG1heWJlVXBkYXRlTGluZU51bWJlcldpZHRoKGNtKSkge1xuICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICAgIHVwZGF0ZS5kaW1zID0gZ2V0RGltZW5zaW9ucyhjbSk7XG4gICAgfVxuXG4gICAgLy8gQ29tcHV0ZSBhIHN1aXRhYmxlIG5ldyB2aWV3cG9ydCAoZnJvbSAmIHRvKVxuICAgIHZhciBlbmQgPSBkb2MuZmlyc3QgKyBkb2Muc2l6ZTtcbiAgICB2YXIgZnJvbSA9IE1hdGgubWF4KHVwZGF0ZS52aXNpYmxlLmZyb20gLSBjbS5vcHRpb25zLnZpZXdwb3J0TWFyZ2luLCBkb2MuZmlyc3QpO1xuICAgIHZhciB0byA9IE1hdGgubWluKGVuZCwgdXBkYXRlLnZpc2libGUudG8gKyBjbS5vcHRpb25zLnZpZXdwb3J0TWFyZ2luKTtcbiAgICBpZiAoZGlzcGxheS52aWV3RnJvbSA8IGZyb20gJiYgZnJvbSAtIGRpc3BsYXkudmlld0Zyb20gPCAyMCkgZnJvbSA9IE1hdGgubWF4KGRvYy5maXJzdCwgZGlzcGxheS52aWV3RnJvbSk7XG4gICAgaWYgKGRpc3BsYXkudmlld1RvID4gdG8gJiYgZGlzcGxheS52aWV3VG8gLSB0byA8IDIwKSB0byA9IE1hdGgubWluKGVuZCwgZGlzcGxheS52aWV3VG8pO1xuICAgIGlmIChzYXdDb2xsYXBzZWRTcGFucykge1xuICAgICAgZnJvbSA9IHZpc3VhbExpbmVObyhjbS5kb2MsIGZyb20pO1xuICAgICAgdG8gPSB2aXN1YWxMaW5lRW5kTm8oY20uZG9jLCB0byk7XG4gICAgfVxuXG4gICAgdmFyIGRpZmZlcmVudCA9IGZyb20gIT0gZGlzcGxheS52aWV3RnJvbSB8fCB0byAhPSBkaXNwbGF5LnZpZXdUbyB8fFxuICAgICAgZGlzcGxheS5sYXN0V3JhcEhlaWdodCAhPSB1cGRhdGUud3JhcHBlckhlaWdodCB8fCBkaXNwbGF5Lmxhc3RXcmFwV2lkdGggIT0gdXBkYXRlLndyYXBwZXJXaWR0aDtcbiAgICBhZGp1c3RWaWV3KGNtLCBmcm9tLCB0byk7XG5cbiAgICBkaXNwbGF5LnZpZXdPZmZzZXQgPSBoZWlnaHRBdExpbmUoZ2V0TGluZShjbS5kb2MsIGRpc3BsYXkudmlld0Zyb20pKTtcbiAgICAvLyBQb3NpdGlvbiB0aGUgbW92ZXIgZGl2IHRvIGFsaWduIHdpdGggdGhlIGN1cnJlbnQgc2Nyb2xsIHBvc2l0aW9uXG4gICAgY20uZGlzcGxheS5tb3Zlci5zdHlsZS50b3AgPSBkaXNwbGF5LnZpZXdPZmZzZXQgKyBcInB4XCI7XG5cbiAgICB2YXIgdG9VcGRhdGUgPSBjb3VudERpcnR5VmlldyhjbSk7XG4gICAgaWYgKCFkaWZmZXJlbnQgJiYgdG9VcGRhdGUgPT0gMCAmJiAhdXBkYXRlLmZvcmNlICYmIGRpc3BsYXkucmVuZGVyZWRWaWV3ID09IGRpc3BsYXkudmlldyAmJlxuICAgICAgICAoZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA9PSBudWxsIHx8IGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPj0gZGlzcGxheS52aWV3VG8pKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgLy8gRm9yIGJpZyBjaGFuZ2VzLCB3ZSBoaWRlIHRoZSBlbmNsb3NpbmcgZWxlbWVudCBkdXJpbmcgdGhlXG4gICAgLy8gdXBkYXRlLCBzaW5jZSB0aGF0IHNwZWVkcyB1cCB0aGUgb3BlcmF0aW9ucyBvbiBtb3N0IGJyb3dzZXJzLlxuICAgIHZhciBmb2N1c2VkID0gYWN0aXZlRWx0KCk7XG4gICAgaWYgKHRvVXBkYXRlID4gNCkgZGlzcGxheS5saW5lRGl2LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICBwYXRjaERpc3BsYXkoY20sIGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMsIHVwZGF0ZS5kaW1zKTtcbiAgICBpZiAodG9VcGRhdGUgPiA0KSBkaXNwbGF5LmxpbmVEaXYuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgZGlzcGxheS5yZW5kZXJlZFZpZXcgPSBkaXNwbGF5LnZpZXc7XG4gICAgLy8gVGhlcmUgbWlnaHQgaGF2ZSBiZWVuIGEgd2lkZ2V0IHdpdGggYSBmb2N1c2VkIGVsZW1lbnQgdGhhdCBnb3RcbiAgICAvLyBoaWRkZW4gb3IgdXBkYXRlZCwgaWYgc28gcmUtZm9jdXMgaXQuXG4gICAgaWYgKGZvY3VzZWQgJiYgYWN0aXZlRWx0KCkgIT0gZm9jdXNlZCAmJiBmb2N1c2VkLm9mZnNldEhlaWdodCkgZm9jdXNlZC5mb2N1cygpO1xuXG4gICAgLy8gUHJldmVudCBzZWxlY3Rpb24gYW5kIGN1cnNvcnMgZnJvbSBpbnRlcmZlcmluZyB3aXRoIHRoZSBzY3JvbGxcbiAgICAvLyB3aWR0aCBhbmQgaGVpZ2h0LlxuICAgIHJlbW92ZUNoaWxkcmVuKGRpc3BsYXkuY3Vyc29yRGl2KTtcbiAgICByZW1vdmVDaGlsZHJlbihkaXNwbGF5LnNlbGVjdGlvbkRpdik7XG4gICAgZGlzcGxheS5ndXR0ZXJzLnN0eWxlLmhlaWdodCA9IGRpc3BsYXkuc2l6ZXIuc3R5bGUubWluSGVpZ2h0ID0gMDtcblxuICAgIGlmIChkaWZmZXJlbnQpIHtcbiAgICAgIGRpc3BsYXkubGFzdFdyYXBIZWlnaHQgPSB1cGRhdGUud3JhcHBlckhlaWdodDtcbiAgICAgIGRpc3BsYXkubGFzdFdyYXBXaWR0aCA9IHVwZGF0ZS53cmFwcGVyV2lkdGg7XG4gICAgICBzdGFydFdvcmtlcihjbSwgNDAwKTtcbiAgICB9XG5cbiAgICBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID0gbnVsbDtcblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgZnVuY3Rpb24gcG9zdFVwZGF0ZURpc3BsYXkoY20sIHVwZGF0ZSkge1xuICAgIHZhciB2aWV3cG9ydCA9IHVwZGF0ZS52aWV3cG9ydDtcbiAgICBmb3IgKHZhciBmaXJzdCA9IHRydWU7OyBmaXJzdCA9IGZhbHNlKSB7XG4gICAgICBpZiAoIWZpcnN0IHx8ICFjbS5vcHRpb25zLmxpbmVXcmFwcGluZyB8fCB1cGRhdGUub2xkRGlzcGxheVdpZHRoID09IGRpc3BsYXlXaWR0aChjbSkpIHtcbiAgICAgICAgLy8gQ2xpcCBmb3JjZWQgdmlld3BvcnQgdG8gYWN0dWFsIHNjcm9sbGFibGUgYXJlYS5cbiAgICAgICAgaWYgKHZpZXdwb3J0ICYmIHZpZXdwb3J0LnRvcCAhPSBudWxsKVxuICAgICAgICAgIHZpZXdwb3J0ID0ge3RvcDogTWF0aC5taW4oY20uZG9jLmhlaWdodCArIHBhZGRpbmdWZXJ0KGNtLmRpc3BsYXkpIC0gZGlzcGxheUhlaWdodChjbSksIHZpZXdwb3J0LnRvcCl9O1xuICAgICAgICAvLyBVcGRhdGVkIGxpbmUgaGVpZ2h0cyBtaWdodCByZXN1bHQgaW4gdGhlIGRyYXduIGFyZWEgbm90XG4gICAgICAgIC8vIGFjdHVhbGx5IGNvdmVyaW5nIHRoZSB2aWV3cG9ydC4gS2VlcCBsb29waW5nIHVudGlsIGl0IGRvZXMuXG4gICAgICAgIHVwZGF0ZS52aXNpYmxlID0gdmlzaWJsZUxpbmVzKGNtLmRpc3BsYXksIGNtLmRvYywgdmlld3BvcnQpO1xuICAgICAgICBpZiAodXBkYXRlLnZpc2libGUuZnJvbSA+PSBjbS5kaXNwbGF5LnZpZXdGcm9tICYmIHVwZGF0ZS52aXNpYmxlLnRvIDw9IGNtLmRpc3BsYXkudmlld1RvKVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKCF1cGRhdGVEaXNwbGF5SWZOZWVkZWQoY20sIHVwZGF0ZSkpIGJyZWFrO1xuICAgICAgdXBkYXRlSGVpZ2h0c0luVmlld3BvcnQoY20pO1xuICAgICAgdmFyIGJhck1lYXN1cmUgPSBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSk7XG4gICAgICB1cGRhdGVTZWxlY3Rpb24oY20pO1xuICAgICAgc2V0RG9jdW1lbnRIZWlnaHQoY20sIGJhck1lYXN1cmUpO1xuICAgICAgdXBkYXRlU2Nyb2xsYmFycyhjbSwgYmFyTWVhc3VyZSk7XG4gICAgfVxuXG4gICAgdXBkYXRlLnNpZ25hbChjbSwgXCJ1cGRhdGVcIiwgY20pO1xuICAgIGlmIChjbS5kaXNwbGF5LnZpZXdGcm9tICE9IGNtLmRpc3BsYXkucmVwb3J0ZWRWaWV3RnJvbSB8fCBjbS5kaXNwbGF5LnZpZXdUbyAhPSBjbS5kaXNwbGF5LnJlcG9ydGVkVmlld1RvKSB7XG4gICAgICB1cGRhdGUuc2lnbmFsKGNtLCBcInZpZXdwb3J0Q2hhbmdlXCIsIGNtLCBjbS5kaXNwbGF5LnZpZXdGcm9tLCBjbS5kaXNwbGF5LnZpZXdUbyk7XG4gICAgICBjbS5kaXNwbGF5LnJlcG9ydGVkVmlld0Zyb20gPSBjbS5kaXNwbGF5LnZpZXdGcm9tOyBjbS5kaXNwbGF5LnJlcG9ydGVkVmlld1RvID0gY20uZGlzcGxheS52aWV3VG87XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlRGlzcGxheVNpbXBsZShjbSwgdmlld3BvcnQpIHtcbiAgICB2YXIgdXBkYXRlID0gbmV3IERpc3BsYXlVcGRhdGUoY20sIHZpZXdwb3J0KTtcbiAgICBpZiAodXBkYXRlRGlzcGxheUlmTmVlZGVkKGNtLCB1cGRhdGUpKSB7XG4gICAgICB1cGRhdGVIZWlnaHRzSW5WaWV3cG9ydChjbSk7XG4gICAgICBwb3N0VXBkYXRlRGlzcGxheShjbSwgdXBkYXRlKTtcbiAgICAgIHZhciBiYXJNZWFzdXJlID0gbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pO1xuICAgICAgdXBkYXRlU2VsZWN0aW9uKGNtKTtcbiAgICAgIHNldERvY3VtZW50SGVpZ2h0KGNtLCBiYXJNZWFzdXJlKTtcbiAgICAgIHVwZGF0ZVNjcm9sbGJhcnMoY20sIGJhck1lYXN1cmUpO1xuICAgICAgdXBkYXRlLmZpbmlzaCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldERvY3VtZW50SGVpZ2h0KGNtLCBtZWFzdXJlKSB7XG4gICAgY20uZGlzcGxheS5zaXplci5zdHlsZS5taW5IZWlnaHQgPSBtZWFzdXJlLmRvY0hlaWdodCArIFwicHhcIjtcbiAgICB2YXIgdG90YWwgPSBtZWFzdXJlLmRvY0hlaWdodCArIGNtLmRpc3BsYXkuYmFySGVpZ2h0O1xuICAgIGNtLmRpc3BsYXkuaGVpZ2h0Rm9yY2VyLnN0eWxlLnRvcCA9IHRvdGFsICsgXCJweFwiO1xuICAgIGNtLmRpc3BsYXkuZ3V0dGVycy5zdHlsZS5oZWlnaHQgPSBNYXRoLm1heCh0b3RhbCArIHNjcm9sbEdhcChjbSksIG1lYXN1cmUuY2xpZW50SGVpZ2h0KSArIFwicHhcIjtcbiAgfVxuXG4gIC8vIFJlYWQgdGhlIGFjdHVhbCBoZWlnaHRzIG9mIHRoZSByZW5kZXJlZCBsaW5lcywgYW5kIHVwZGF0ZSB0aGVpclxuICAvLyBzdG9yZWQgaGVpZ2h0cyB0byBtYXRjaC5cbiAgZnVuY3Rpb24gdXBkYXRlSGVpZ2h0c0luVmlld3BvcnQoY20pIHtcbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gICAgdmFyIHByZXZCb3R0b20gPSBkaXNwbGF5LmxpbmVEaXYub2Zmc2V0VG9wO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGlzcGxheS52aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgY3VyID0gZGlzcGxheS52aWV3W2ldLCBoZWlnaHQ7XG4gICAgICBpZiAoY3VyLmhpZGRlbikgY29udGludWU7XG4gICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDgpIHtcbiAgICAgICAgdmFyIGJvdCA9IGN1ci5ub2RlLm9mZnNldFRvcCArIGN1ci5ub2RlLm9mZnNldEhlaWdodDtcbiAgICAgICAgaGVpZ2h0ID0gYm90IC0gcHJldkJvdHRvbTtcbiAgICAgICAgcHJldkJvdHRvbSA9IGJvdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBib3ggPSBjdXIubm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgaGVpZ2h0ID0gYm94LmJvdHRvbSAtIGJveC50b3A7XG4gICAgICB9XG4gICAgICB2YXIgZGlmZiA9IGN1ci5saW5lLmhlaWdodCAtIGhlaWdodDtcbiAgICAgIGlmIChoZWlnaHQgPCAyKSBoZWlnaHQgPSB0ZXh0SGVpZ2h0KGRpc3BsYXkpO1xuICAgICAgaWYgKGRpZmYgPiAuMDAxIHx8IGRpZmYgPCAtLjAwMSkge1xuICAgICAgICB1cGRhdGVMaW5lSGVpZ2h0KGN1ci5saW5lLCBoZWlnaHQpO1xuICAgICAgICB1cGRhdGVXaWRnZXRIZWlnaHQoY3VyLmxpbmUpO1xuICAgICAgICBpZiAoY3VyLnJlc3QpIGZvciAodmFyIGogPSAwOyBqIDwgY3VyLnJlc3QubGVuZ3RoOyBqKyspXG4gICAgICAgICAgdXBkYXRlV2lkZ2V0SGVpZ2h0KGN1ci5yZXN0W2pdKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZWFkIGFuZCBzdG9yZSB0aGUgaGVpZ2h0IG9mIGxpbmUgd2lkZ2V0cyBhc3NvY2lhdGVkIHdpdGggdGhlXG4gIC8vIGdpdmVuIGxpbmUuXG4gIGZ1bmN0aW9uIHVwZGF0ZVdpZGdldEhlaWdodChsaW5lKSB7XG4gICAgaWYgKGxpbmUud2lkZ2V0cykgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lLndpZGdldHMubGVuZ3RoOyArK2kpXG4gICAgICBsaW5lLndpZGdldHNbaV0uaGVpZ2h0ID0gbGluZS53aWRnZXRzW2ldLm5vZGUub2Zmc2V0SGVpZ2h0O1xuICB9XG5cbiAgLy8gRG8gYSBidWxrLXJlYWQgb2YgdGhlIERPTSBwb3NpdGlvbnMgYW5kIHNpemVzIG5lZWRlZCB0byBkcmF3IHRoZVxuICAvLyB2aWV3LCBzbyB0aGF0IHdlIGRvbid0IGludGVybGVhdmUgcmVhZGluZyBhbmQgd3JpdGluZyB0byB0aGUgRE9NLlxuICBmdW5jdGlvbiBnZXREaW1lbnNpb25zKGNtKSB7XG4gICAgdmFyIGQgPSBjbS5kaXNwbGF5LCBsZWZ0ID0ge30sIHdpZHRoID0ge307XG4gICAgdmFyIGd1dHRlckxlZnQgPSBkLmd1dHRlcnMuY2xpZW50TGVmdDtcbiAgICBmb3IgKHZhciBuID0gZC5ndXR0ZXJzLmZpcnN0Q2hpbGQsIGkgPSAwOyBuOyBuID0gbi5uZXh0U2libGluZywgKytpKSB7XG4gICAgICBsZWZ0W2NtLm9wdGlvbnMuZ3V0dGVyc1tpXV0gPSBuLm9mZnNldExlZnQgKyBuLmNsaWVudExlZnQgKyBndXR0ZXJMZWZ0O1xuICAgICAgd2lkdGhbY20ub3B0aW9ucy5ndXR0ZXJzW2ldXSA9IG4uY2xpZW50V2lkdGg7XG4gICAgfVxuICAgIHJldHVybiB7Zml4ZWRQb3M6IGNvbXBlbnNhdGVGb3JIU2Nyb2xsKGQpLFxuICAgICAgICAgICAgZ3V0dGVyVG90YWxXaWR0aDogZC5ndXR0ZXJzLm9mZnNldFdpZHRoLFxuICAgICAgICAgICAgZ3V0dGVyTGVmdDogbGVmdCxcbiAgICAgICAgICAgIGd1dHRlcldpZHRoOiB3aWR0aCxcbiAgICAgICAgICAgIHdyYXBwZXJXaWR0aDogZC53cmFwcGVyLmNsaWVudFdpZHRofTtcbiAgfVxuXG4gIC8vIFN5bmMgdGhlIGFjdHVhbCBkaXNwbGF5IERPTSBzdHJ1Y3R1cmUgd2l0aCBkaXNwbGF5LnZpZXcsIHJlbW92aW5nXG4gIC8vIG5vZGVzIGZvciBsaW5lcyB0aGF0IGFyZSBubyBsb25nZXIgaW4gdmlldywgYW5kIGNyZWF0aW5nIHRoZSBvbmVzXG4gIC8vIHRoYXQgYXJlIG5vdCB0aGVyZSB5ZXQsIGFuZCB1cGRhdGluZyB0aGUgb25lcyB0aGF0IGFyZSBvdXQgb2ZcbiAgLy8gZGF0ZS5cbiAgZnVuY3Rpb24gcGF0Y2hEaXNwbGF5KGNtLCB1cGRhdGVOdW1iZXJzRnJvbSwgZGltcykge1xuICAgIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgbGluZU51bWJlcnMgPSBjbS5vcHRpb25zLmxpbmVOdW1iZXJzO1xuICAgIHZhciBjb250YWluZXIgPSBkaXNwbGF5LmxpbmVEaXYsIGN1ciA9IGNvbnRhaW5lci5maXJzdENoaWxkO1xuXG4gICAgZnVuY3Rpb24gcm0obm9kZSkge1xuICAgICAgdmFyIG5leHQgPSBub2RlLm5leHRTaWJsaW5nO1xuICAgICAgLy8gV29ya3MgYXJvdW5kIGEgdGhyb3ctc2Nyb2xsIGJ1ZyBpbiBPUyBYIFdlYmtpdFxuICAgICAgaWYgKHdlYmtpdCAmJiBtYWMgJiYgY20uZGlzcGxheS5jdXJyZW50V2hlZWxUYXJnZXQgPT0gbm9kZSlcbiAgICAgICAgbm9kZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICBlbHNlXG4gICAgICAgIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcbiAgICAgIHJldHVybiBuZXh0O1xuICAgIH1cblxuICAgIHZhciB2aWV3ID0gZGlzcGxheS52aWV3LCBsaW5lTiA9IGRpc3BsYXkudmlld0Zyb207XG4gICAgLy8gTG9vcCBvdmVyIHRoZSBlbGVtZW50cyBpbiB0aGUgdmlldywgc3luY2luZyBjdXIgKHRoZSBET00gbm9kZXNcbiAgICAvLyBpbiBkaXNwbGF5LmxpbmVEaXYpIHdpdGggdGhlIHZpZXcgYXMgd2UgZ28uXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgbGluZVZpZXcgPSB2aWV3W2ldO1xuICAgICAgaWYgKGxpbmVWaWV3LmhpZGRlbikge1xuICAgICAgfSBlbHNlIGlmICghbGluZVZpZXcubm9kZSB8fCBsaW5lVmlldy5ub2RlLnBhcmVudE5vZGUgIT0gY29udGFpbmVyKSB7IC8vIE5vdCBkcmF3biB5ZXRcbiAgICAgICAgdmFyIG5vZGUgPSBidWlsZExpbmVFbGVtZW50KGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpO1xuICAgICAgICBjb250YWluZXIuaW5zZXJ0QmVmb3JlKG5vZGUsIGN1cik7XG4gICAgICB9IGVsc2UgeyAvLyBBbHJlYWR5IGRyYXduXG4gICAgICAgIHdoaWxlIChjdXIgIT0gbGluZVZpZXcubm9kZSkgY3VyID0gcm0oY3VyKTtcbiAgICAgICAgdmFyIHVwZGF0ZU51bWJlciA9IGxpbmVOdW1iZXJzICYmIHVwZGF0ZU51bWJlcnNGcm9tICE9IG51bGwgJiZcbiAgICAgICAgICB1cGRhdGVOdW1iZXJzRnJvbSA8PSBsaW5lTiAmJiBsaW5lVmlldy5saW5lTnVtYmVyO1xuICAgICAgICBpZiAobGluZVZpZXcuY2hhbmdlcykge1xuICAgICAgICAgIGlmIChpbmRleE9mKGxpbmVWaWV3LmNoYW5nZXMsIFwiZ3V0dGVyXCIpID4gLTEpIHVwZGF0ZU51bWJlciA9IGZhbHNlO1xuICAgICAgICAgIHVwZGF0ZUxpbmVGb3JDaGFuZ2VzKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh1cGRhdGVOdW1iZXIpIHtcbiAgICAgICAgICByZW1vdmVDaGlsZHJlbihsaW5lVmlldy5saW5lTnVtYmVyKTtcbiAgICAgICAgICBsaW5lVmlldy5saW5lTnVtYmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGxpbmVOdW1iZXJGb3IoY20ub3B0aW9ucywgbGluZU4pKSk7XG4gICAgICAgIH1cbiAgICAgICAgY3VyID0gbGluZVZpZXcubm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cbiAgICAgIGxpbmVOICs9IGxpbmVWaWV3LnNpemU7XG4gICAgfVxuICAgIHdoaWxlIChjdXIpIGN1ciA9IHJtKGN1cik7XG4gIH1cblxuICAvLyBXaGVuIGFuIGFzcGVjdCBvZiBhIGxpbmUgY2hhbmdlcywgYSBzdHJpbmcgaXMgYWRkZWQgdG9cbiAgLy8gbGluZVZpZXcuY2hhbmdlcy4gVGhpcyB1cGRhdGVzIHRoZSByZWxldmFudCBwYXJ0IG9mIHRoZSBsaW5lJ3NcbiAgLy8gRE9NIHN0cnVjdHVyZS5cbiAgZnVuY3Rpb24gdXBkYXRlTGluZUZvckNoYW5nZXMoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcykge1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbGluZVZpZXcuY2hhbmdlcy5sZW5ndGg7IGorKykge1xuICAgICAgdmFyIHR5cGUgPSBsaW5lVmlldy5jaGFuZ2VzW2pdO1xuICAgICAgaWYgKHR5cGUgPT0gXCJ0ZXh0XCIpIHVwZGF0ZUxpbmVUZXh0KGNtLCBsaW5lVmlldyk7XG4gICAgICBlbHNlIGlmICh0eXBlID09IFwiZ3V0dGVyXCIpIHVwZGF0ZUxpbmVHdXR0ZXIoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcyk7XG4gICAgICBlbHNlIGlmICh0eXBlID09IFwiY2xhc3NcIikgdXBkYXRlTGluZUNsYXNzZXMobGluZVZpZXcpO1xuICAgICAgZWxzZSBpZiAodHlwZSA9PSBcIndpZGdldFwiKSB1cGRhdGVMaW5lV2lkZ2V0cyhjbSwgbGluZVZpZXcsIGRpbXMpO1xuICAgIH1cbiAgICBsaW5lVmlldy5jaGFuZ2VzID0gbnVsbDtcbiAgfVxuXG4gIC8vIExpbmVzIHdpdGggZ3V0dGVyIGVsZW1lbnRzLCB3aWRnZXRzIG9yIGEgYmFja2dyb3VuZCBjbGFzcyBuZWVkIHRvXG4gIC8vIGJlIHdyYXBwZWQsIGFuZCBoYXZlIHRoZSBleHRyYSBlbGVtZW50cyBhZGRlZCB0byB0aGUgd3JhcHBlciBkaXZcbiAgZnVuY3Rpb24gZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpIHtcbiAgICBpZiAobGluZVZpZXcubm9kZSA9PSBsaW5lVmlldy50ZXh0KSB7XG4gICAgICBsaW5lVmlldy5ub2RlID0gZWx0KFwiZGl2XCIsIG51bGwsIG51bGwsIFwicG9zaXRpb246IHJlbGF0aXZlXCIpO1xuICAgICAgaWYgKGxpbmVWaWV3LnRleHQucGFyZW50Tm9kZSlcbiAgICAgICAgbGluZVZpZXcudGV4dC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChsaW5lVmlldy5ub2RlLCBsaW5lVmlldy50ZXh0KTtcbiAgICAgIGxpbmVWaWV3Lm5vZGUuYXBwZW5kQ2hpbGQobGluZVZpZXcudGV4dCk7XG4gICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDgpIGxpbmVWaWV3Lm5vZGUuc3R5bGUuekluZGV4ID0gMjtcbiAgICB9XG4gICAgcmV0dXJuIGxpbmVWaWV3Lm5vZGU7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVMaW5lQmFja2dyb3VuZChsaW5lVmlldykge1xuICAgIHZhciBjbHMgPSBsaW5lVmlldy5iZ0NsYXNzID8gbGluZVZpZXcuYmdDbGFzcyArIFwiIFwiICsgKGxpbmVWaWV3LmxpbmUuYmdDbGFzcyB8fCBcIlwiKSA6IGxpbmVWaWV3LmxpbmUuYmdDbGFzcztcbiAgICBpZiAoY2xzKSBjbHMgKz0gXCIgQ29kZU1pcnJvci1saW5lYmFja2dyb3VuZFwiO1xuICAgIGlmIChsaW5lVmlldy5iYWNrZ3JvdW5kKSB7XG4gICAgICBpZiAoY2xzKSBsaW5lVmlldy5iYWNrZ3JvdW5kLmNsYXNzTmFtZSA9IGNscztcbiAgICAgIGVsc2UgeyBsaW5lVmlldy5iYWNrZ3JvdW5kLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobGluZVZpZXcuYmFja2dyb3VuZCk7IGxpbmVWaWV3LmJhY2tncm91bmQgPSBudWxsOyB9XG4gICAgfSBlbHNlIGlmIChjbHMpIHtcbiAgICAgIHZhciB3cmFwID0gZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpO1xuICAgICAgbGluZVZpZXcuYmFja2dyb3VuZCA9IHdyYXAuaW5zZXJ0QmVmb3JlKGVsdChcImRpdlwiLCBudWxsLCBjbHMpLCB3cmFwLmZpcnN0Q2hpbGQpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFdyYXBwZXIgYXJvdW5kIGJ1aWxkTGluZUNvbnRlbnQgd2hpY2ggd2lsbCByZXVzZSB0aGUgc3RydWN0dXJlXG4gIC8vIGluIGRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCB3aGVuIHBvc3NpYmxlLlxuICBmdW5jdGlvbiBnZXRMaW5lQ29udGVudChjbSwgbGluZVZpZXcpIHtcbiAgICB2YXIgZXh0ID0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkO1xuICAgIGlmIChleHQgJiYgZXh0LmxpbmUgPT0gbGluZVZpZXcubGluZSkge1xuICAgICAgY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkID0gbnVsbDtcbiAgICAgIGxpbmVWaWV3Lm1lYXN1cmUgPSBleHQubWVhc3VyZTtcbiAgICAgIHJldHVybiBleHQuYnVpbHQ7XG4gICAgfVxuICAgIHJldHVybiBidWlsZExpbmVDb250ZW50KGNtLCBsaW5lVmlldyk7XG4gIH1cblxuICAvLyBSZWRyYXcgdGhlIGxpbmUncyB0ZXh0LiBJbnRlcmFjdHMgd2l0aCB0aGUgYmFja2dyb3VuZCBhbmQgdGV4dFxuICAvLyBjbGFzc2VzIGJlY2F1c2UgdGhlIG1vZGUgbWF5IG91dHB1dCB0b2tlbnMgdGhhdCBpbmZsdWVuY2UgdGhlc2VcbiAgLy8gY2xhc3Nlcy5cbiAgZnVuY3Rpb24gdXBkYXRlTGluZVRleHQoY20sIGxpbmVWaWV3KSB7XG4gICAgdmFyIGNscyA9IGxpbmVWaWV3LnRleHQuY2xhc3NOYW1lO1xuICAgIHZhciBidWlsdCA9IGdldExpbmVDb250ZW50KGNtLCBsaW5lVmlldyk7XG4gICAgaWYgKGxpbmVWaWV3LnRleHQgPT0gbGluZVZpZXcubm9kZSkgbGluZVZpZXcubm9kZSA9IGJ1aWx0LnByZTtcbiAgICBsaW5lVmlldy50ZXh0LnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGJ1aWx0LnByZSwgbGluZVZpZXcudGV4dCk7XG4gICAgbGluZVZpZXcudGV4dCA9IGJ1aWx0LnByZTtcbiAgICBpZiAoYnVpbHQuYmdDbGFzcyAhPSBsaW5lVmlldy5iZ0NsYXNzIHx8IGJ1aWx0LnRleHRDbGFzcyAhPSBsaW5lVmlldy50ZXh0Q2xhc3MpIHtcbiAgICAgIGxpbmVWaWV3LmJnQ2xhc3MgPSBidWlsdC5iZ0NsYXNzO1xuICAgICAgbGluZVZpZXcudGV4dENsYXNzID0gYnVpbHQudGV4dENsYXNzO1xuICAgICAgdXBkYXRlTGluZUNsYXNzZXMobGluZVZpZXcpO1xuICAgIH0gZWxzZSBpZiAoY2xzKSB7XG4gICAgICBsaW5lVmlldy50ZXh0LmNsYXNzTmFtZSA9IGNscztcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVMaW5lQ2xhc3NlcyhsaW5lVmlldykge1xuICAgIHVwZGF0ZUxpbmVCYWNrZ3JvdW5kKGxpbmVWaWV3KTtcbiAgICBpZiAobGluZVZpZXcubGluZS53cmFwQ2xhc3MpXG4gICAgICBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldykuY2xhc3NOYW1lID0gbGluZVZpZXcubGluZS53cmFwQ2xhc3M7XG4gICAgZWxzZSBpZiAobGluZVZpZXcubm9kZSAhPSBsaW5lVmlldy50ZXh0KVxuICAgICAgbGluZVZpZXcubm9kZS5jbGFzc05hbWUgPSBcIlwiO1xuICAgIHZhciB0ZXh0Q2xhc3MgPSBsaW5lVmlldy50ZXh0Q2xhc3MgPyBsaW5lVmlldy50ZXh0Q2xhc3MgKyBcIiBcIiArIChsaW5lVmlldy5saW5lLnRleHRDbGFzcyB8fCBcIlwiKSA6IGxpbmVWaWV3LmxpbmUudGV4dENsYXNzO1xuICAgIGxpbmVWaWV3LnRleHQuY2xhc3NOYW1lID0gdGV4dENsYXNzIHx8IFwiXCI7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVMaW5lR3V0dGVyKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpIHtcbiAgICBpZiAobGluZVZpZXcuZ3V0dGVyKSB7XG4gICAgICBsaW5lVmlldy5ub2RlLnJlbW92ZUNoaWxkKGxpbmVWaWV3Lmd1dHRlcik7XG4gICAgICBsaW5lVmlldy5ndXR0ZXIgPSBudWxsO1xuICAgIH1cbiAgICBpZiAobGluZVZpZXcuZ3V0dGVyQmFja2dyb3VuZCkge1xuICAgICAgbGluZVZpZXcubm9kZS5yZW1vdmVDaGlsZChsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kKTtcbiAgICAgIGxpbmVWaWV3Lmd1dHRlckJhY2tncm91bmQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAobGluZVZpZXcubGluZS5ndXR0ZXJDbGFzcykge1xuICAgICAgdmFyIHdyYXAgPSBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldyk7XG4gICAgICBsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1ndXR0ZXItYmFja2dyb3VuZCBcIiArIGxpbmVWaWV3LmxpbmUuZ3V0dGVyQ2xhc3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibGVmdDogXCIgKyAoY20ub3B0aW9ucy5maXhlZEd1dHRlciA/IGRpbXMuZml4ZWRQb3MgOiAtZGltcy5ndXR0ZXJUb3RhbFdpZHRoKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHg7IHdpZHRoOiBcIiArIGRpbXMuZ3V0dGVyVG90YWxXaWR0aCArIFwicHhcIik7XG4gICAgICB3cmFwLmluc2VydEJlZm9yZShsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kLCBsaW5lVmlldy50ZXh0KTtcbiAgICB9XG4gICAgdmFyIG1hcmtlcnMgPSBsaW5lVmlldy5saW5lLmd1dHRlck1hcmtlcnM7XG4gICAgaWYgKGNtLm9wdGlvbnMubGluZU51bWJlcnMgfHwgbWFya2Vycykge1xuICAgICAgdmFyIHdyYXAgPSBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldyk7XG4gICAgICB2YXIgZ3V0dGVyV3JhcCA9IGxpbmVWaWV3Lmd1dHRlciA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyLXdyYXBwZXJcIiwgXCJsZWZ0OiBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoY20ub3B0aW9ucy5maXhlZEd1dHRlciA/IGRpbXMuZml4ZWRQb3MgOiAtZGltcy5ndXR0ZXJUb3RhbFdpZHRoKSArIFwicHhcIik7XG4gICAgICBjbS5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUoZ3V0dGVyV3JhcCk7XG4gICAgICB3cmFwLmluc2VydEJlZm9yZShndXR0ZXJXcmFwLCBsaW5lVmlldy50ZXh0KTtcbiAgICAgIGlmIChsaW5lVmlldy5saW5lLmd1dHRlckNsYXNzKVxuICAgICAgICBndXR0ZXJXcmFwLmNsYXNzTmFtZSArPSBcIiBcIiArIGxpbmVWaWV3LmxpbmUuZ3V0dGVyQ2xhc3M7XG4gICAgICBpZiAoY20ub3B0aW9ucy5saW5lTnVtYmVycyAmJiAoIW1hcmtlcnMgfHwgIW1hcmtlcnNbXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCJdKSlcbiAgICAgICAgbGluZVZpZXcubGluZU51bWJlciA9IGd1dHRlcldyYXAuYXBwZW5kQ2hpbGQoXG4gICAgICAgICAgZWx0KFwiZGl2XCIsIGxpbmVOdW1iZXJGb3IoY20ub3B0aW9ucywgbGluZU4pLFxuICAgICAgICAgICAgICBcIkNvZGVNaXJyb3ItbGluZW51bWJlciBDb2RlTWlycm9yLWd1dHRlci1lbHRcIixcbiAgICAgICAgICAgICAgXCJsZWZ0OiBcIiArIGRpbXMuZ3V0dGVyTGVmdFtcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIl0gKyBcInB4OyB3aWR0aDogXCJcbiAgICAgICAgICAgICAgKyBjbS5kaXNwbGF5LmxpbmVOdW1Jbm5lcldpZHRoICsgXCJweFwiKSk7XG4gICAgICBpZiAobWFya2VycykgZm9yICh2YXIgayA9IDA7IGsgPCBjbS5vcHRpb25zLmd1dHRlcnMubGVuZ3RoOyArK2spIHtcbiAgICAgICAgdmFyIGlkID0gY20ub3B0aW9ucy5ndXR0ZXJzW2tdLCBmb3VuZCA9IG1hcmtlcnMuaGFzT3duUHJvcGVydHkoaWQpICYmIG1hcmtlcnNbaWRdO1xuICAgICAgICBpZiAoZm91bmQpXG4gICAgICAgICAgZ3V0dGVyV3JhcC5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgW2ZvdW5kXSwgXCJDb2RlTWlycm9yLWd1dHRlci1lbHRcIiwgXCJsZWZ0OiBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGltcy5ndXR0ZXJMZWZ0W2lkXSArIFwicHg7IHdpZHRoOiBcIiArIGRpbXMuZ3V0dGVyV2lkdGhbaWRdICsgXCJweFwiKSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdXBkYXRlTGluZVdpZGdldHMoY20sIGxpbmVWaWV3LCBkaW1zKSB7XG4gICAgaWYgKGxpbmVWaWV3LmFsaWduYWJsZSkgbGluZVZpZXcuYWxpZ25hYmxlID0gbnVsbDtcbiAgICBmb3IgKHZhciBub2RlID0gbGluZVZpZXcubm9kZS5maXJzdENoaWxkLCBuZXh0OyBub2RlOyBub2RlID0gbmV4dCkge1xuICAgICAgdmFyIG5leHQgPSBub2RlLm5leHRTaWJsaW5nO1xuICAgICAgaWYgKG5vZGUuY2xhc3NOYW1lID09IFwiQ29kZU1pcnJvci1saW5ld2lkZ2V0XCIpXG4gICAgICAgIGxpbmVWaWV3Lm5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgfVxuICAgIGluc2VydExpbmVXaWRnZXRzKGNtLCBsaW5lVmlldywgZGltcyk7XG4gIH1cblxuICAvLyBCdWlsZCBhIGxpbmUncyBET00gcmVwcmVzZW50YXRpb24gZnJvbSBzY3JhdGNoXG4gIGZ1bmN0aW9uIGJ1aWxkTGluZUVsZW1lbnQoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcykge1xuICAgIHZhciBidWlsdCA9IGdldExpbmVDb250ZW50KGNtLCBsaW5lVmlldyk7XG4gICAgbGluZVZpZXcudGV4dCA9IGxpbmVWaWV3Lm5vZGUgPSBidWlsdC5wcmU7XG4gICAgaWYgKGJ1aWx0LmJnQ2xhc3MpIGxpbmVWaWV3LmJnQ2xhc3MgPSBidWlsdC5iZ0NsYXNzO1xuICAgIGlmIChidWlsdC50ZXh0Q2xhc3MpIGxpbmVWaWV3LnRleHRDbGFzcyA9IGJ1aWx0LnRleHRDbGFzcztcblxuICAgIHVwZGF0ZUxpbmVDbGFzc2VzKGxpbmVWaWV3KTtcbiAgICB1cGRhdGVMaW5lR3V0dGVyKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpO1xuICAgIGluc2VydExpbmVXaWRnZXRzKGNtLCBsaW5lVmlldywgZGltcyk7XG4gICAgcmV0dXJuIGxpbmVWaWV3Lm5vZGU7XG4gIH1cblxuICAvLyBBIGxpbmVWaWV3IG1heSBjb250YWluIG11bHRpcGxlIGxvZ2ljYWwgbGluZXMgKHdoZW4gbWVyZ2VkIGJ5XG4gIC8vIGNvbGxhcHNlZCBzcGFucykuIFRoZSB3aWRnZXRzIGZvciBhbGwgb2YgdGhlbSBuZWVkIHRvIGJlIGRyYXduLlxuICBmdW5jdGlvbiBpbnNlcnRMaW5lV2lkZ2V0cyhjbSwgbGluZVZpZXcsIGRpbXMpIHtcbiAgICBpbnNlcnRMaW5lV2lkZ2V0c0ZvcihjbSwgbGluZVZpZXcubGluZSwgbGluZVZpZXcsIGRpbXMsIHRydWUpO1xuICAgIGlmIChsaW5lVmlldy5yZXN0KSBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVWaWV3LnJlc3QubGVuZ3RoOyBpKyspXG4gICAgICBpbnNlcnRMaW5lV2lkZ2V0c0ZvcihjbSwgbGluZVZpZXcucmVzdFtpXSwgbGluZVZpZXcsIGRpbXMsIGZhbHNlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluc2VydExpbmVXaWRnZXRzRm9yKGNtLCBsaW5lLCBsaW5lVmlldywgZGltcywgYWxsb3dBYm92ZSkge1xuICAgIGlmICghbGluZS53aWRnZXRzKSByZXR1cm47XG4gICAgdmFyIHdyYXAgPSBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldyk7XG4gICAgZm9yICh2YXIgaSA9IDAsIHdzID0gbGluZS53aWRnZXRzOyBpIDwgd3MubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciB3aWRnZXQgPSB3c1tpXSwgbm9kZSA9IGVsdChcImRpdlwiLCBbd2lkZ2V0Lm5vZGVdLCBcIkNvZGVNaXJyb3ItbGluZXdpZGdldFwiKTtcbiAgICAgIGlmICghd2lkZ2V0LmhhbmRsZU1vdXNlRXZlbnRzKSBub2RlLnNldEF0dHJpYnV0ZShcImNtLWlnbm9yZS1ldmVudHNcIiwgXCJ0cnVlXCIpO1xuICAgICAgcG9zaXRpb25MaW5lV2lkZ2V0KHdpZGdldCwgbm9kZSwgbGluZVZpZXcsIGRpbXMpO1xuICAgICAgY20uZGlzcGxheS5pbnB1dC5zZXRVbmVkaXRhYmxlKG5vZGUpO1xuICAgICAgaWYgKGFsbG93QWJvdmUgJiYgd2lkZ2V0LmFib3ZlKVxuICAgICAgICB3cmFwLmluc2VydEJlZm9yZShub2RlLCBsaW5lVmlldy5ndXR0ZXIgfHwgbGluZVZpZXcudGV4dCk7XG4gICAgICBlbHNlXG4gICAgICAgIHdyYXAuYXBwZW5kQ2hpbGQobm9kZSk7XG4gICAgICBzaWduYWxMYXRlcih3aWRnZXQsIFwicmVkcmF3XCIpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBvc2l0aW9uTGluZVdpZGdldCh3aWRnZXQsIG5vZGUsIGxpbmVWaWV3LCBkaW1zKSB7XG4gICAgaWYgKHdpZGdldC5ub0hTY3JvbGwpIHtcbiAgICAgIChsaW5lVmlldy5hbGlnbmFibGUgfHwgKGxpbmVWaWV3LmFsaWduYWJsZSA9IFtdKSkucHVzaChub2RlKTtcbiAgICAgIHZhciB3aWR0aCA9IGRpbXMud3JhcHBlcldpZHRoO1xuICAgICAgbm9kZS5zdHlsZS5sZWZ0ID0gZGltcy5maXhlZFBvcyArIFwicHhcIjtcbiAgICAgIGlmICghd2lkZ2V0LmNvdmVyR3V0dGVyKSB7XG4gICAgICAgIHdpZHRoIC09IGRpbXMuZ3V0dGVyVG90YWxXaWR0aDtcbiAgICAgICAgbm9kZS5zdHlsZS5wYWRkaW5nTGVmdCA9IGRpbXMuZ3V0dGVyVG90YWxXaWR0aCArIFwicHhcIjtcbiAgICAgIH1cbiAgICAgIG5vZGUuc3R5bGUud2lkdGggPSB3aWR0aCArIFwicHhcIjtcbiAgICB9XG4gICAgaWYgKHdpZGdldC5jb3Zlckd1dHRlcikge1xuICAgICAgbm9kZS5zdHlsZS56SW5kZXggPSA1O1xuICAgICAgbm9kZS5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcbiAgICAgIGlmICghd2lkZ2V0Lm5vSFNjcm9sbCkgbm9kZS5zdHlsZS5tYXJnaW5MZWZ0ID0gLWRpbXMuZ3V0dGVyVG90YWxXaWR0aCArIFwicHhcIjtcbiAgICB9XG4gIH1cblxuICAvLyBQT1NJVElPTiBPQkpFQ1RcblxuICAvLyBBIFBvcyBpbnN0YW5jZSByZXByZXNlbnRzIGEgcG9zaXRpb24gd2l0aGluIHRoZSB0ZXh0LlxuICB2YXIgUG9zID0gQ29kZU1pcnJvci5Qb3MgPSBmdW5jdGlvbihsaW5lLCBjaCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBQb3MpKSByZXR1cm4gbmV3IFBvcyhsaW5lLCBjaCk7XG4gICAgdGhpcy5saW5lID0gbGluZTsgdGhpcy5jaCA9IGNoO1xuICB9O1xuXG4gIC8vIENvbXBhcmUgdHdvIHBvc2l0aW9ucywgcmV0dXJuIDAgaWYgdGhleSBhcmUgdGhlIHNhbWUsIGEgbmVnYXRpdmVcbiAgLy8gbnVtYmVyIHdoZW4gYSBpcyBsZXNzLCBhbmQgYSBwb3NpdGl2ZSBudW1iZXIgb3RoZXJ3aXNlLlxuICB2YXIgY21wID0gQ29kZU1pcnJvci5jbXBQb3MgPSBmdW5jdGlvbihhLCBiKSB7IHJldHVybiBhLmxpbmUgLSBiLmxpbmUgfHwgYS5jaCAtIGIuY2g7IH07XG5cbiAgZnVuY3Rpb24gY29weVBvcyh4KSB7cmV0dXJuIFBvcyh4LmxpbmUsIHguY2gpO31cbiAgZnVuY3Rpb24gbWF4UG9zKGEsIGIpIHsgcmV0dXJuIGNtcChhLCBiKSA8IDAgPyBiIDogYTsgfVxuICBmdW5jdGlvbiBtaW5Qb3MoYSwgYikgeyByZXR1cm4gY21wKGEsIGIpIDwgMCA/IGEgOiBiOyB9XG5cbiAgLy8gSU5QVVQgSEFORExJTkdcblxuICBmdW5jdGlvbiBlbnN1cmVGb2N1cyhjbSkge1xuICAgIGlmICghY20uc3RhdGUuZm9jdXNlZCkgeyBjbS5kaXNwbGF5LmlucHV0LmZvY3VzKCk7IG9uRm9jdXMoY20pOyB9XG4gIH1cblxuICBmdW5jdGlvbiBpc1JlYWRPbmx5KGNtKSB7XG4gICAgcmV0dXJuIGNtLm9wdGlvbnMucmVhZE9ubHkgfHwgY20uZG9jLmNhbnRFZGl0O1xuICB9XG5cbiAgLy8gVGhpcyB3aWxsIGJlIHNldCB0byBhbiBhcnJheSBvZiBzdHJpbmdzIHdoZW4gY29weWluZywgc28gdGhhdCxcbiAgLy8gd2hlbiBwYXN0aW5nLCB3ZSBrbm93IHdoYXQga2luZCBvZiBzZWxlY3Rpb25zIHRoZSBjb3BpZWQgdGV4dFxuICAvLyB3YXMgbWFkZSBvdXQgb2YuXG4gIHZhciBsYXN0Q29waWVkID0gbnVsbDtcblxuICBmdW5jdGlvbiBhcHBseVRleHRJbnB1dChjbSwgaW5zZXJ0ZWQsIGRlbGV0ZWQsIHNlbCwgb3JpZ2luKSB7XG4gICAgdmFyIGRvYyA9IGNtLmRvYztcbiAgICBjbS5kaXNwbGF5LnNoaWZ0ID0gZmFsc2U7XG4gICAgaWYgKCFzZWwpIHNlbCA9IGRvYy5zZWw7XG5cbiAgICB2YXIgcGFzdGUgPSBjbS5zdGF0ZS5wYXN0ZUluY29taW5nIHx8IG9yaWdpbiA9PSBcInBhc3RlXCI7XG4gICAgdmFyIHRleHRMaW5lcyA9IGRvYy5zcGxpdExpbmVzKGluc2VydGVkKSwgbXVsdGlQYXN0ZSA9IG51bGw7XG4gICAgLy8gV2hlbiBwYXNpbmcgTiBsaW5lcyBpbnRvIE4gc2VsZWN0aW9ucywgaW5zZXJ0IG9uZSBsaW5lIHBlciBzZWxlY3Rpb25cbiAgICBpZiAocGFzdGUgJiYgc2VsLnJhbmdlcy5sZW5ndGggPiAxKSB7XG4gICAgICBpZiAobGFzdENvcGllZCAmJiBsYXN0Q29waWVkLmpvaW4oXCJcXG5cIikgPT0gaW5zZXJ0ZWQpIHtcbiAgICAgICAgaWYgKHNlbC5yYW5nZXMubGVuZ3RoICUgbGFzdENvcGllZC5sZW5ndGggPT0gMCkge1xuICAgICAgICAgIG11bHRpUGFzdGUgPSBbXTtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxhc3RDb3BpZWQubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBtdWx0aVBhc3RlLnB1c2goZG9jLnNwbGl0TGluZXMobGFzdENvcGllZFtpXSkpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHRleHRMaW5lcy5sZW5ndGggPT0gc2VsLnJhbmdlcy5sZW5ndGgpIHtcbiAgICAgICAgbXVsdGlQYXN0ZSA9IG1hcCh0ZXh0TGluZXMsIGZ1bmN0aW9uKGwpIHsgcmV0dXJuIFtsXTsgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTm9ybWFsIGJlaGF2aW9yIGlzIHRvIGluc2VydCB0aGUgbmV3IHRleHQgaW50byBldmVyeSBzZWxlY3Rpb25cbiAgICBmb3IgKHZhciBpID0gc2VsLnJhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgdmFyIHJhbmdlID0gc2VsLnJhbmdlc1tpXTtcbiAgICAgIHZhciBmcm9tID0gcmFuZ2UuZnJvbSgpLCB0byA9IHJhbmdlLnRvKCk7XG4gICAgICBpZiAocmFuZ2UuZW1wdHkoKSkge1xuICAgICAgICBpZiAoZGVsZXRlZCAmJiBkZWxldGVkID4gMCkgLy8gSGFuZGxlIGRlbGV0aW9uXG4gICAgICAgICAgZnJvbSA9IFBvcyhmcm9tLmxpbmUsIGZyb20uY2ggLSBkZWxldGVkKTtcbiAgICAgICAgZWxzZSBpZiAoY20uc3RhdGUub3ZlcndyaXRlICYmICFwYXN0ZSkgLy8gSGFuZGxlIG92ZXJ3cml0ZVxuICAgICAgICAgIHRvID0gUG9zKHRvLmxpbmUsIE1hdGgubWluKGdldExpbmUoZG9jLCB0by5saW5lKS50ZXh0Lmxlbmd0aCwgdG8uY2ggKyBsc3QodGV4dExpbmVzKS5sZW5ndGgpKTtcbiAgICAgIH1cbiAgICAgIHZhciB1cGRhdGVJbnB1dCA9IGNtLmN1ck9wLnVwZGF0ZUlucHV0O1xuICAgICAgdmFyIGNoYW5nZUV2ZW50ID0ge2Zyb206IGZyb20sIHRvOiB0bywgdGV4dDogbXVsdGlQYXN0ZSA/IG11bHRpUGFzdGVbaSAlIG11bHRpUGFzdGUubGVuZ3RoXSA6IHRleHRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW46IG9yaWdpbiB8fCAocGFzdGUgPyBcInBhc3RlXCIgOiBjbS5zdGF0ZS5jdXRJbmNvbWluZyA/IFwiY3V0XCIgOiBcIitpbnB1dFwiKX07XG4gICAgICBtYWtlQ2hhbmdlKGNtLmRvYywgY2hhbmdlRXZlbnQpO1xuICAgICAgc2lnbmFsTGF0ZXIoY20sIFwiaW5wdXRSZWFkXCIsIGNtLCBjaGFuZ2VFdmVudCk7XG4gICAgfVxuICAgIGlmIChpbnNlcnRlZCAmJiAhcGFzdGUpXG4gICAgICB0cmlnZ2VyRWxlY3RyaWMoY20sIGluc2VydGVkKTtcblxuICAgIGVuc3VyZUN1cnNvclZpc2libGUoY20pO1xuICAgIGNtLmN1ck9wLnVwZGF0ZUlucHV0ID0gdXBkYXRlSW5wdXQ7XG4gICAgY20uY3VyT3AudHlwaW5nID0gdHJ1ZTtcbiAgICBjbS5zdGF0ZS5wYXN0ZUluY29taW5nID0gY20uc3RhdGUuY3V0SW5jb21pbmcgPSBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZVBhc3RlKGUsIGNtKSB7XG4gICAgdmFyIHBhc3RlZCA9IGUuY2xpcGJvYXJkRGF0YSAmJiBlLmNsaXBib2FyZERhdGEuZ2V0RGF0YShcInRleHQvcGxhaW5cIik7XG4gICAgaWYgKHBhc3RlZCkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgaWYgKCFpc1JlYWRPbmx5KGNtKSAmJiAhY20ub3B0aW9ucy5kaXNhYmxlSW5wdXQpXG4gICAgICAgIHJ1bkluT3AoY20sIGZ1bmN0aW9uKCkgeyBhcHBseVRleHRJbnB1dChjbSwgcGFzdGVkLCAwLCBudWxsLCBcInBhc3RlXCIpOyB9KTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRyaWdnZXJFbGVjdHJpYyhjbSwgaW5zZXJ0ZWQpIHtcbiAgICAvLyBXaGVuIGFuICdlbGVjdHJpYycgY2hhcmFjdGVyIGlzIGluc2VydGVkLCBpbW1lZGlhdGVseSB0cmlnZ2VyIGEgcmVpbmRlbnRcbiAgICBpZiAoIWNtLm9wdGlvbnMuZWxlY3RyaWNDaGFycyB8fCAhY20ub3B0aW9ucy5zbWFydEluZGVudCkgcmV0dXJuO1xuICAgIHZhciBzZWwgPSBjbS5kb2Muc2VsO1xuXG4gICAgZm9yICh2YXIgaSA9IHNlbC5yYW5nZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIHZhciByYW5nZSA9IHNlbC5yYW5nZXNbaV07XG4gICAgICBpZiAocmFuZ2UuaGVhZC5jaCA+IDEwMCB8fCAoaSAmJiBzZWwucmFuZ2VzW2kgLSAxXS5oZWFkLmxpbmUgPT0gcmFuZ2UuaGVhZC5saW5lKSkgY29udGludWU7XG4gICAgICB2YXIgbW9kZSA9IGNtLmdldE1vZGVBdChyYW5nZS5oZWFkKTtcbiAgICAgIHZhciBpbmRlbnRlZCA9IGZhbHNlO1xuICAgICAgaWYgKG1vZGUuZWxlY3RyaWNDaGFycykge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG1vZGUuZWxlY3RyaWNDaGFycy5sZW5ndGg7IGorKylcbiAgICAgICAgICBpZiAoaW5zZXJ0ZWQuaW5kZXhPZihtb2RlLmVsZWN0cmljQ2hhcnMuY2hhckF0KGopKSA+IC0xKSB7XG4gICAgICAgICAgICBpbmRlbnRlZCA9IGluZGVudExpbmUoY20sIHJhbmdlLmhlYWQubGluZSwgXCJzbWFydFwiKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobW9kZS5lbGVjdHJpY0lucHV0KSB7XG4gICAgICAgIGlmIChtb2RlLmVsZWN0cmljSW5wdXQudGVzdChnZXRMaW5lKGNtLmRvYywgcmFuZ2UuaGVhZC5saW5lKS50ZXh0LnNsaWNlKDAsIHJhbmdlLmhlYWQuY2gpKSlcbiAgICAgICAgICBpbmRlbnRlZCA9IGluZGVudExpbmUoY20sIHJhbmdlLmhlYWQubGluZSwgXCJzbWFydFwiKTtcbiAgICAgIH1cbiAgICAgIGlmIChpbmRlbnRlZCkgc2lnbmFsTGF0ZXIoY20sIFwiZWxlY3RyaWNJbnB1dFwiLCBjbSwgcmFuZ2UuaGVhZC5saW5lKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBjb3B5YWJsZVJhbmdlcyhjbSkge1xuICAgIHZhciB0ZXh0ID0gW10sIHJhbmdlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY20uZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBsaW5lID0gY20uZG9jLnNlbC5yYW5nZXNbaV0uaGVhZC5saW5lO1xuICAgICAgdmFyIGxpbmVSYW5nZSA9IHthbmNob3I6IFBvcyhsaW5lLCAwKSwgaGVhZDogUG9zKGxpbmUgKyAxLCAwKX07XG4gICAgICByYW5nZXMucHVzaChsaW5lUmFuZ2UpO1xuICAgICAgdGV4dC5wdXNoKGNtLmdldFJhbmdlKGxpbmVSYW5nZS5hbmNob3IsIGxpbmVSYW5nZS5oZWFkKSk7XG4gICAgfVxuICAgIHJldHVybiB7dGV4dDogdGV4dCwgcmFuZ2VzOiByYW5nZXN9O1xuICB9XG5cbiAgZnVuY3Rpb24gZGlzYWJsZUJyb3dzZXJNYWdpYyhmaWVsZCkge1xuICAgIGZpZWxkLnNldEF0dHJpYnV0ZShcImF1dG9jb3JyZWN0XCIsIFwib2ZmXCIpO1xuICAgIGZpZWxkLnNldEF0dHJpYnV0ZShcImF1dG9jYXBpdGFsaXplXCIsIFwib2ZmXCIpO1xuICAgIGZpZWxkLnNldEF0dHJpYnV0ZShcInNwZWxsY2hlY2tcIiwgXCJmYWxzZVwiKTtcbiAgfVxuXG4gIC8vIFRFWFRBUkVBIElOUFVUIFNUWUxFXG5cbiAgZnVuY3Rpb24gVGV4dGFyZWFJbnB1dChjbSkge1xuICAgIHRoaXMuY20gPSBjbTtcbiAgICAvLyBTZWUgaW5wdXQucG9sbCBhbmQgaW5wdXQucmVzZXRcbiAgICB0aGlzLnByZXZJbnB1dCA9IFwiXCI7XG5cbiAgICAvLyBGbGFnIHRoYXQgaW5kaWNhdGVzIHdoZXRoZXIgd2UgZXhwZWN0IGlucHV0IHRvIGFwcGVhciByZWFsIHNvb25cbiAgICAvLyBub3cgKGFmdGVyIHNvbWUgZXZlbnQgbGlrZSAna2V5cHJlc3MnIG9yICdpbnB1dCcpIGFuZCBhcmVcbiAgICAvLyBwb2xsaW5nIGludGVuc2l2ZWx5LlxuICAgIHRoaXMucG9sbGluZ0Zhc3QgPSBmYWxzZTtcbiAgICAvLyBTZWxmLXJlc2V0dGluZyB0aW1lb3V0IGZvciB0aGUgcG9sbGVyXG4gICAgdGhpcy5wb2xsaW5nID0gbmV3IERlbGF5ZWQoKTtcbiAgICAvLyBUcmFja3Mgd2hlbiBpbnB1dC5yZXNldCBoYXMgcHVudGVkIHRvIGp1c3QgcHV0dGluZyBhIHNob3J0XG4gICAgLy8gc3RyaW5nIGludG8gdGhlIHRleHRhcmVhIGluc3RlYWQgb2YgdGhlIGZ1bGwgc2VsZWN0aW9uLlxuICAgIHRoaXMuaW5hY2N1cmF0ZVNlbGVjdGlvbiA9IGZhbHNlO1xuICAgIC8vIFVzZWQgdG8gd29yayBhcm91bmQgSUUgaXNzdWUgd2l0aCBzZWxlY3Rpb24gYmVpbmcgZm9yZ290dGVuIHdoZW4gZm9jdXMgbW92ZXMgYXdheSBmcm9tIHRleHRhcmVhXG4gICAgdGhpcy5oYXNTZWxlY3Rpb24gPSBmYWxzZTtcbiAgICB0aGlzLmNvbXBvc2luZyA9IG51bGw7XG4gIH07XG5cbiAgZnVuY3Rpb24gaGlkZGVuVGV4dGFyZWEoKSB7XG4gICAgdmFyIHRlID0gZWx0KFwidGV4dGFyZWFcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogYWJzb2x1dGU7IHBhZGRpbmc6IDA7IHdpZHRoOiAxcHg7IGhlaWdodDogMWVtOyBvdXRsaW5lOiBub25lXCIpO1xuICAgIHZhciBkaXYgPSBlbHQoXCJkaXZcIiwgW3RlXSwgbnVsbCwgXCJvdmVyZmxvdzogaGlkZGVuOyBwb3NpdGlvbjogcmVsYXRpdmU7IHdpZHRoOiAzcHg7IGhlaWdodDogMHB4O1wiKTtcbiAgICAvLyBUaGUgdGV4dGFyZWEgaXMga2VwdCBwb3NpdGlvbmVkIG5lYXIgdGhlIGN1cnNvciB0byBwcmV2ZW50IHRoZVxuICAgIC8vIGZhY3QgdGhhdCBpdCdsbCBiZSBzY3JvbGxlZCBpbnRvIHZpZXcgb24gaW5wdXQgZnJvbSBzY3JvbGxpbmdcbiAgICAvLyBvdXIgZmFrZSBjdXJzb3Igb3V0IG9mIHZpZXcuIE9uIHdlYmtpdCwgd2hlbiB3cmFwPW9mZiwgcGFzdGUgaXNcbiAgICAvLyB2ZXJ5IHNsb3cuIFNvIG1ha2UgdGhlIGFyZWEgd2lkZSBpbnN0ZWFkLlxuICAgIGlmICh3ZWJraXQpIHRlLnN0eWxlLndpZHRoID0gXCIxMDAwcHhcIjtcbiAgICBlbHNlIHRlLnNldEF0dHJpYnV0ZShcIndyYXBcIiwgXCJvZmZcIik7XG4gICAgLy8gSWYgYm9yZGVyOiAwOyAtLSBpT1MgZmFpbHMgdG8gb3BlbiBrZXlib2FyZCAoaXNzdWUgIzEyODcpXG4gICAgaWYgKGlvcykgdGUuc3R5bGUuYm9yZGVyID0gXCIxcHggc29saWQgYmxhY2tcIjtcbiAgICBkaXNhYmxlQnJvd3Nlck1hZ2ljKHRlKTtcbiAgICByZXR1cm4gZGl2O1xuICB9XG5cbiAgVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUgPSBjb3B5T2JqKHtcbiAgICBpbml0OiBmdW5jdGlvbihkaXNwbGF5KSB7XG4gICAgICB2YXIgaW5wdXQgPSB0aGlzLCBjbSA9IHRoaXMuY207XG5cbiAgICAgIC8vIFdyYXBzIGFuZCBoaWRlcyBpbnB1dCB0ZXh0YXJlYVxuICAgICAgdmFyIGRpdiA9IHRoaXMud3JhcHBlciA9IGhpZGRlblRleHRhcmVhKCk7XG4gICAgICAvLyBUaGUgc2VtaWhpZGRlbiB0ZXh0YXJlYSB0aGF0IGlzIGZvY3VzZWQgd2hlbiB0aGUgZWRpdG9yIGlzXG4gICAgICAvLyBmb2N1c2VkLCBhbmQgcmVjZWl2ZXMgaW5wdXQuXG4gICAgICB2YXIgdGUgPSB0aGlzLnRleHRhcmVhID0gZGl2LmZpcnN0Q2hpbGQ7XG4gICAgICBkaXNwbGF5LndyYXBwZXIuaW5zZXJ0QmVmb3JlKGRpdiwgZGlzcGxheS53cmFwcGVyLmZpcnN0Q2hpbGQpO1xuXG4gICAgICAvLyBOZWVkZWQgdG8gaGlkZSBiaWcgYmx1ZSBibGlua2luZyBjdXJzb3Igb24gTW9iaWxlIFNhZmFyaSAoZG9lc24ndCBzZWVtIHRvIHdvcmsgaW4gaU9TIDggYW55bW9yZSlcbiAgICAgIGlmIChpb3MpIHRlLnN0eWxlLndpZHRoID0gXCIwcHhcIjtcblxuICAgICAgb24odGUsIFwiaW5wdXRcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkgJiYgaW5wdXQuaGFzU2VsZWN0aW9uKSBpbnB1dC5oYXNTZWxlY3Rpb24gPSBudWxsO1xuICAgICAgICBpbnB1dC5wb2xsKCk7XG4gICAgICB9KTtcblxuICAgICAgb24odGUsIFwicGFzdGVcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICBpZiAoaGFuZGxlUGFzdGUoZSwgY20pKSByZXR1cm4gdHJ1ZTtcblxuICAgICAgICBjbS5zdGF0ZS5wYXN0ZUluY29taW5nID0gdHJ1ZTtcbiAgICAgICAgaW5wdXQuZmFzdFBvbGwoKTtcbiAgICAgIH0pO1xuXG4gICAgICBmdW5jdGlvbiBwcmVwYXJlQ29weUN1dChlKSB7XG4gICAgICAgIGlmIChjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSB7XG4gICAgICAgICAgbGFzdENvcGllZCA9IGNtLmdldFNlbGVjdGlvbnMoKTtcbiAgICAgICAgICBpZiAoaW5wdXQuaW5hY2N1cmF0ZVNlbGVjdGlvbikge1xuICAgICAgICAgICAgaW5wdXQucHJldklucHV0ID0gXCJcIjtcbiAgICAgICAgICAgIGlucHV0LmluYWNjdXJhdGVTZWxlY3Rpb24gPSBmYWxzZTtcbiAgICAgICAgICAgIHRlLnZhbHVlID0gbGFzdENvcGllZC5qb2luKFwiXFxuXCIpO1xuICAgICAgICAgICAgc2VsZWN0SW5wdXQodGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghY20ub3B0aW9ucy5saW5lV2lzZUNvcHlDdXQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIHJhbmdlcyA9IGNvcHlhYmxlUmFuZ2VzKGNtKTtcbiAgICAgICAgICBsYXN0Q29waWVkID0gcmFuZ2VzLnRleHQ7XG4gICAgICAgICAgaWYgKGUudHlwZSA9PSBcImN1dFwiKSB7XG4gICAgICAgICAgICBjbS5zZXRTZWxlY3Rpb25zKHJhbmdlcy5yYW5nZXMsIG51bGwsIHNlbF9kb250U2Nyb2xsKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5wdXQucHJldklucHV0ID0gXCJcIjtcbiAgICAgICAgICAgIHRlLnZhbHVlID0gcmFuZ2VzLnRleHQuam9pbihcIlxcblwiKTtcbiAgICAgICAgICAgIHNlbGVjdElucHV0KHRlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGUudHlwZSA9PSBcImN1dFwiKSBjbS5zdGF0ZS5jdXRJbmNvbWluZyA9IHRydWU7XG4gICAgICB9XG4gICAgICBvbih0ZSwgXCJjdXRcIiwgcHJlcGFyZUNvcHlDdXQpO1xuICAgICAgb24odGUsIFwiY29weVwiLCBwcmVwYXJlQ29weUN1dCk7XG5cbiAgICAgIG9uKGRpc3BsYXkuc2Nyb2xsZXIsIFwicGFzdGVcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICBpZiAoZXZlbnRJbldpZGdldChkaXNwbGF5LCBlKSkgcmV0dXJuO1xuICAgICAgICBjbS5zdGF0ZS5wYXN0ZUluY29taW5nID0gdHJ1ZTtcbiAgICAgICAgaW5wdXQuZm9jdXMoKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBQcmV2ZW50IG5vcm1hbCBzZWxlY3Rpb24gaW4gdGhlIGVkaXRvciAod2UgaGFuZGxlIG91ciBvd24pXG4gICAgICBvbihkaXNwbGF5LmxpbmVTcGFjZSwgXCJzZWxlY3RzdGFydFwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGlmICghZXZlbnRJbldpZGdldChkaXNwbGF5LCBlKSkgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgIH0pO1xuXG4gICAgICBvbih0ZSwgXCJjb21wb3NpdGlvbnN0YXJ0XCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgc3RhcnQgPSBjbS5nZXRDdXJzb3IoXCJmcm9tXCIpO1xuICAgICAgICBpZiAoaW5wdXQuY29tcG9zaW5nKSBpbnB1dC5jb21wb3NpbmcucmFuZ2UuY2xlYXIoKVxuICAgICAgICBpbnB1dC5jb21wb3NpbmcgPSB7XG4gICAgICAgICAgc3RhcnQ6IHN0YXJ0LFxuICAgICAgICAgIHJhbmdlOiBjbS5tYXJrVGV4dChzdGFydCwgY20uZ2V0Q3Vyc29yKFwidG9cIiksIHtjbGFzc05hbWU6IFwiQ29kZU1pcnJvci1jb21wb3NpbmdcIn0pXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIG9uKHRlLCBcImNvbXBvc2l0aW9uZW5kXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoaW5wdXQuY29tcG9zaW5nKSB7XG4gICAgICAgICAgaW5wdXQucG9sbCgpO1xuICAgICAgICAgIGlucHV0LmNvbXBvc2luZy5yYW5nZS5jbGVhcigpO1xuICAgICAgICAgIGlucHV0LmNvbXBvc2luZyA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICBwcmVwYXJlU2VsZWN0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgIC8vIFJlZHJhdyB0aGUgc2VsZWN0aW9uIGFuZC9vciBjdXJzb3JcbiAgICAgIHZhciBjbSA9IHRoaXMuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gICAgICB2YXIgcmVzdWx0ID0gcHJlcGFyZVNlbGVjdGlvbihjbSk7XG5cbiAgICAgIC8vIE1vdmUgdGhlIGhpZGRlbiB0ZXh0YXJlYSBuZWFyIHRoZSBjdXJzb3IgdG8gcHJldmVudCBzY3JvbGxpbmcgYXJ0aWZhY3RzXG4gICAgICBpZiAoY20ub3B0aW9ucy5tb3ZlSW5wdXRXaXRoQ3Vyc29yKSB7XG4gICAgICAgIHZhciBoZWFkUG9zID0gY3Vyc29yQ29vcmRzKGNtLCBkb2Muc2VsLnByaW1hcnkoKS5oZWFkLCBcImRpdlwiKTtcbiAgICAgICAgdmFyIHdyYXBPZmYgPSBkaXNwbGF5LndyYXBwZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksIGxpbmVPZmYgPSBkaXNwbGF5LmxpbmVEaXYuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIHJlc3VsdC50ZVRvcCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQgLSAxMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVhZFBvcy50b3AgKyBsaW5lT2ZmLnRvcCAtIHdyYXBPZmYudG9wKSk7XG4gICAgICAgIHJlc3VsdC50ZUxlZnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihkaXNwbGF5LndyYXBwZXIuY2xpZW50V2lkdGggLSAxMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRQb3MubGVmdCArIGxpbmVPZmYubGVmdCAtIHdyYXBPZmYubGVmdCkpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cbiAgICBzaG93U2VsZWN0aW9uOiBmdW5jdGlvbihkcmF3bikge1xuICAgICAgdmFyIGNtID0gdGhpcy5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gICAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5LmN1cnNvckRpdiwgZHJhd24uY3Vyc29ycyk7XG4gICAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5LnNlbGVjdGlvbkRpdiwgZHJhd24uc2VsZWN0aW9uKTtcbiAgICAgIGlmIChkcmF3bi50ZVRvcCAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMud3JhcHBlci5zdHlsZS50b3AgPSBkcmF3bi50ZVRvcCArIFwicHhcIjtcbiAgICAgICAgdGhpcy53cmFwcGVyLnN0eWxlLmxlZnQgPSBkcmF3bi50ZUxlZnQgKyBcInB4XCI7XG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIFJlc2V0IHRoZSBpbnB1dCB0byBjb3JyZXNwb25kIHRvIHRoZSBzZWxlY3Rpb24gKG9yIHRvIGJlIGVtcHR5LFxuICAgIC8vIHdoZW4gbm90IHR5cGluZyBhbmQgbm90aGluZyBpcyBzZWxlY3RlZClcbiAgICByZXNldDogZnVuY3Rpb24odHlwaW5nKSB7XG4gICAgICBpZiAodGhpcy5jb250ZXh0TWVudVBlbmRpbmcpIHJldHVybjtcbiAgICAgIHZhciBtaW5pbWFsLCBzZWxlY3RlZCwgY20gPSB0aGlzLmNtLCBkb2MgPSBjbS5kb2M7XG4gICAgICBpZiAoY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkge1xuICAgICAgICB0aGlzLnByZXZJbnB1dCA9IFwiXCI7XG4gICAgICAgIHZhciByYW5nZSA9IGRvYy5zZWwucHJpbWFyeSgpO1xuICAgICAgICBtaW5pbWFsID0gaGFzQ29weUV2ZW50ICYmXG4gICAgICAgICAgKHJhbmdlLnRvKCkubGluZSAtIHJhbmdlLmZyb20oKS5saW5lID4gMTAwIHx8IChzZWxlY3RlZCA9IGNtLmdldFNlbGVjdGlvbigpKS5sZW5ndGggPiAxMDAwKTtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSBtaW5pbWFsID8gXCItXCIgOiBzZWxlY3RlZCB8fCBjbS5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy50ZXh0YXJlYS52YWx1ZSA9IGNvbnRlbnQ7XG4gICAgICAgIGlmIChjbS5zdGF0ZS5mb2N1c2VkKSBzZWxlY3RJbnB1dCh0aGlzLnRleHRhcmVhKTtcbiAgICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSkgdGhpcy5oYXNTZWxlY3Rpb24gPSBjb250ZW50O1xuICAgICAgfSBlbHNlIGlmICghdHlwaW5nKSB7XG4gICAgICAgIHRoaXMucHJldklucHV0ID0gdGhpcy50ZXh0YXJlYS52YWx1ZSA9IFwiXCI7XG4gICAgICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkpIHRoaXMuaGFzU2VsZWN0aW9uID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIHRoaXMuaW5hY2N1cmF0ZVNlbGVjdGlvbiA9IG1pbmltYWw7XG4gICAgfSxcblxuICAgIGdldEZpZWxkOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMudGV4dGFyZWE7IH0sXG5cbiAgICBzdXBwb3J0c1RvdWNoOiBmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9LFxuXG4gICAgZm9jdXM6IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKHRoaXMuY20ub3B0aW9ucy5yZWFkT25seSAhPSBcIm5vY3Vyc29yXCIgJiYgKCFtb2JpbGUgfHwgYWN0aXZlRWx0KCkgIT0gdGhpcy50ZXh0YXJlYSkpIHtcbiAgICAgICAgdHJ5IHsgdGhpcy50ZXh0YXJlYS5mb2N1cygpOyB9XG4gICAgICAgIGNhdGNoIChlKSB7fSAvLyBJRTggd2lsbCB0aHJvdyBpZiB0aGUgdGV4dGFyZWEgaXMgZGlzcGxheTogbm9uZSBvciBub3QgaW4gRE9NXG4gICAgICB9XG4gICAgfSxcblxuICAgIGJsdXI6IGZ1bmN0aW9uKCkgeyB0aGlzLnRleHRhcmVhLmJsdXIoKTsgfSxcblxuICAgIHJlc2V0UG9zaXRpb246IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy53cmFwcGVyLnN0eWxlLnRvcCA9IHRoaXMud3JhcHBlci5zdHlsZS5sZWZ0ID0gMDtcbiAgICB9LFxuXG4gICAgcmVjZWl2ZWRGb2N1czogZnVuY3Rpb24oKSB7IHRoaXMuc2xvd1BvbGwoKTsgfSxcblxuICAgIC8vIFBvbGwgZm9yIGlucHV0IGNoYW5nZXMsIHVzaW5nIHRoZSBub3JtYWwgcmF0ZSBvZiBwb2xsaW5nLiBUaGlzXG4gICAgLy8gcnVucyBhcyBsb25nIGFzIHRoZSBlZGl0b3IgaXMgZm9jdXNlZC5cbiAgICBzbG93UG9sbDogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaW5wdXQgPSB0aGlzO1xuICAgICAgaWYgKGlucHV0LnBvbGxpbmdGYXN0KSByZXR1cm47XG4gICAgICBpbnB1dC5wb2xsaW5nLnNldCh0aGlzLmNtLm9wdGlvbnMucG9sbEludGVydmFsLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaW5wdXQucG9sbCgpO1xuICAgICAgICBpZiAoaW5wdXQuY20uc3RhdGUuZm9jdXNlZCkgaW5wdXQuc2xvd1BvbGwoKTtcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvLyBXaGVuIGFuIGV2ZW50IGhhcyBqdXN0IGNvbWUgaW4gdGhhdCBpcyBsaWtlbHkgdG8gYWRkIG9yIGNoYW5nZVxuICAgIC8vIHNvbWV0aGluZyBpbiB0aGUgaW5wdXQgdGV4dGFyZWEsIHdlIHBvbGwgZmFzdGVyLCB0byBlbnN1cmUgdGhhdFxuICAgIC8vIHRoZSBjaGFuZ2UgYXBwZWFycyBvbiB0aGUgc2NyZWVuIHF1aWNrbHkuXG4gICAgZmFzdFBvbGw6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG1pc3NlZCA9IGZhbHNlLCBpbnB1dCA9IHRoaXM7XG4gICAgICBpbnB1dC5wb2xsaW5nRmFzdCA9IHRydWU7XG4gICAgICBmdW5jdGlvbiBwKCkge1xuICAgICAgICB2YXIgY2hhbmdlZCA9IGlucHV0LnBvbGwoKTtcbiAgICAgICAgaWYgKCFjaGFuZ2VkICYmICFtaXNzZWQpIHttaXNzZWQgPSB0cnVlOyBpbnB1dC5wb2xsaW5nLnNldCg2MCwgcCk7fVxuICAgICAgICBlbHNlIHtpbnB1dC5wb2xsaW5nRmFzdCA9IGZhbHNlOyBpbnB1dC5zbG93UG9sbCgpO31cbiAgICAgIH1cbiAgICAgIGlucHV0LnBvbGxpbmcuc2V0KDIwLCBwKTtcbiAgICB9LFxuXG4gICAgLy8gUmVhZCBpbnB1dCBmcm9tIHRoZSB0ZXh0YXJlYSwgYW5kIHVwZGF0ZSB0aGUgZG9jdW1lbnQgdG8gbWF0Y2guXG4gICAgLy8gV2hlbiBzb21ldGhpbmcgaXMgc2VsZWN0ZWQsIGl0IGlzIHByZXNlbnQgaW4gdGhlIHRleHRhcmVhLCBhbmRcbiAgICAvLyBzZWxlY3RlZCAodW5sZXNzIGl0IGlzIGh1Z2UsIGluIHdoaWNoIGNhc2UgYSBwbGFjZWhvbGRlciBpc1xuICAgIC8vIHVzZWQpLiBXaGVuIG5vdGhpbmcgaXMgc2VsZWN0ZWQsIHRoZSBjdXJzb3Igc2l0cyBhZnRlciBwcmV2aW91c2x5XG4gICAgLy8gc2VlbiB0ZXh0IChjYW4gYmUgZW1wdHkpLCB3aGljaCBpcyBzdG9yZWQgaW4gcHJldklucHV0ICh3ZSBtdXN0XG4gICAgLy8gbm90IHJlc2V0IHRoZSB0ZXh0YXJlYSB3aGVuIHR5cGluZywgYmVjYXVzZSB0aGF0IGJyZWFrcyBJTUUpLlxuICAgIHBvbGw6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGNtID0gdGhpcy5jbSwgaW5wdXQgPSB0aGlzLnRleHRhcmVhLCBwcmV2SW5wdXQgPSB0aGlzLnByZXZJbnB1dDtcbiAgICAgIC8vIFNpbmNlIHRoaXMgaXMgY2FsbGVkIGEgKmxvdCosIHRyeSB0byBiYWlsIG91dCBhcyBjaGVhcGx5IGFzXG4gICAgICAvLyBwb3NzaWJsZSB3aGVuIGl0IGlzIGNsZWFyIHRoYXQgbm90aGluZyBoYXBwZW5lZC4gaGFzU2VsZWN0aW9uXG4gICAgICAvLyB3aWxsIGJlIHRoZSBjYXNlIHdoZW4gdGhlcmUgaXMgYSBsb3Qgb2YgdGV4dCBpbiB0aGUgdGV4dGFyZWEsXG4gICAgICAvLyBpbiB3aGljaCBjYXNlIHJlYWRpbmcgaXRzIHZhbHVlIHdvdWxkIGJlIGV4cGVuc2l2ZS5cbiAgICAgIGlmICh0aGlzLmNvbnRleHRNZW51UGVuZGluZyB8fCAhY20uc3RhdGUuZm9jdXNlZCB8fFxuICAgICAgICAgIChoYXNTZWxlY3Rpb24oaW5wdXQpICYmICFwcmV2SW5wdXQgJiYgIXRoaXMuY29tcG9zaW5nKSB8fFxuICAgICAgICAgIGlzUmVhZE9ubHkoY20pIHx8IGNtLm9wdGlvbnMuZGlzYWJsZUlucHV0IHx8IGNtLnN0YXRlLmtleVNlcSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICB2YXIgdGV4dCA9IGlucHV0LnZhbHVlO1xuICAgICAgLy8gSWYgbm90aGluZyBjaGFuZ2VkLCBiYWlsLlxuICAgICAgaWYgKHRleHQgPT0gcHJldklucHV0ICYmICFjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSByZXR1cm4gZmFsc2U7XG4gICAgICAvLyBXb3JrIGFyb3VuZCBub25zZW5zaWNhbCBzZWxlY3Rpb24gcmVzZXR0aW5nIGluIElFOS8xMCwgYW5kXG4gICAgICAvLyBpbmV4cGxpY2FibGUgYXBwZWFyYW5jZSBvZiBwcml2YXRlIGFyZWEgdW5pY29kZSBjaGFyYWN0ZXJzIG9uXG4gICAgICAvLyBzb21lIGtleSBjb21ib3MgaW4gTWFjICgjMjY4OSkuXG4gICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5ICYmIHRoaXMuaGFzU2VsZWN0aW9uID09PSB0ZXh0IHx8XG4gICAgICAgICAgbWFjICYmIC9bXFx1ZjcwMC1cXHVmN2ZmXS8udGVzdCh0ZXh0KSkge1xuICAgICAgICBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNtLmRvYy5zZWwgPT0gY20uZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSkge1xuICAgICAgICB2YXIgZmlyc3QgPSB0ZXh0LmNoYXJDb2RlQXQoMCk7XG4gICAgICAgIGlmIChmaXJzdCA9PSAweDIwMGIgJiYgIXByZXZJbnB1dCkgcHJldklucHV0ID0gXCJcXHUyMDBiXCI7XG4gICAgICAgIGlmIChmaXJzdCA9PSAweDIxZGEpIHsgdGhpcy5yZXNldCgpOyByZXR1cm4gdGhpcy5jbS5leGVjQ29tbWFuZChcInVuZG9cIik7IH1cbiAgICAgIH1cbiAgICAgIC8vIEZpbmQgdGhlIHBhcnQgb2YgdGhlIGlucHV0IHRoYXQgaXMgYWN0dWFsbHkgbmV3XG4gICAgICB2YXIgc2FtZSA9IDAsIGwgPSBNYXRoLm1pbihwcmV2SW5wdXQubGVuZ3RoLCB0ZXh0Lmxlbmd0aCk7XG4gICAgICB3aGlsZSAoc2FtZSA8IGwgJiYgcHJldklucHV0LmNoYXJDb2RlQXQoc2FtZSkgPT0gdGV4dC5jaGFyQ29kZUF0KHNhbWUpKSArK3NhbWU7XG5cbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHJ1bkluT3AoY20sIGZ1bmN0aW9uKCkge1xuICAgICAgICBhcHBseVRleHRJbnB1dChjbSwgdGV4dC5zbGljZShzYW1lKSwgcHJldklucHV0Lmxlbmd0aCAtIHNhbWUsXG4gICAgICAgICAgICAgICAgICAgICAgIG51bGwsIHNlbGYuY29tcG9zaW5nID8gXCIqY29tcG9zZVwiIDogbnVsbCk7XG5cbiAgICAgICAgLy8gRG9uJ3QgbGVhdmUgbG9uZyB0ZXh0IGluIHRoZSB0ZXh0YXJlYSwgc2luY2UgaXQgbWFrZXMgZnVydGhlciBwb2xsaW5nIHNsb3dcbiAgICAgICAgaWYgKHRleHQubGVuZ3RoID4gMTAwMCB8fCB0ZXh0LmluZGV4T2YoXCJcXG5cIikgPiAtMSkgaW5wdXQudmFsdWUgPSBzZWxmLnByZXZJbnB1dCA9IFwiXCI7XG4gICAgICAgIGVsc2Ugc2VsZi5wcmV2SW5wdXQgPSB0ZXh0O1xuXG4gICAgICAgIGlmIChzZWxmLmNvbXBvc2luZykge1xuICAgICAgICAgIHNlbGYuY29tcG9zaW5nLnJhbmdlLmNsZWFyKCk7XG4gICAgICAgICAgc2VsZi5jb21wb3NpbmcucmFuZ2UgPSBjbS5tYXJrVGV4dChzZWxmLmNvbXBvc2luZy5zdGFydCwgY20uZ2V0Q3Vyc29yKFwidG9cIiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7Y2xhc3NOYW1lOiBcIkNvZGVNaXJyb3ItY29tcG9zaW5nXCJ9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9LFxuXG4gICAgZW5zdXJlUG9sbGVkOiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICh0aGlzLnBvbGxpbmdGYXN0ICYmIHRoaXMucG9sbCgpKSB0aGlzLnBvbGxpbmdGYXN0ID0gZmFsc2U7XG4gICAgfSxcblxuICAgIG9uS2V5UHJlc3M6IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSkgdGhpcy5oYXNTZWxlY3Rpb24gPSBudWxsO1xuICAgICAgdGhpcy5mYXN0UG9sbCgpO1xuICAgIH0sXG5cbiAgICBvbkNvbnRleHRNZW51OiBmdW5jdGlvbihlKSB7XG4gICAgICB2YXIgaW5wdXQgPSB0aGlzLCBjbSA9IGlucHV0LmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheSwgdGUgPSBpbnB1dC50ZXh0YXJlYTtcbiAgICAgIHZhciBwb3MgPSBwb3NGcm9tTW91c2UoY20sIGUpLCBzY3JvbGxQb3MgPSBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcDtcbiAgICAgIGlmICghcG9zIHx8IHByZXN0bykgcmV0dXJuOyAvLyBPcGVyYSBpcyBkaWZmaWN1bHQuXG5cbiAgICAgIC8vIFJlc2V0IHRoZSBjdXJyZW50IHRleHQgc2VsZWN0aW9uIG9ubHkgaWYgdGhlIGNsaWNrIGlzIGRvbmUgb3V0c2lkZSBvZiB0aGUgc2VsZWN0aW9uXG4gICAgICAvLyBhbmQgJ3Jlc2V0U2VsZWN0aW9uT25Db250ZXh0TWVudScgb3B0aW9uIGlzIHRydWUuXG4gICAgICB2YXIgcmVzZXQgPSBjbS5vcHRpb25zLnJlc2V0U2VsZWN0aW9uT25Db250ZXh0TWVudTtcbiAgICAgIGlmIChyZXNldCAmJiBjbS5kb2Muc2VsLmNvbnRhaW5zKHBvcykgPT0gLTEpXG4gICAgICAgIG9wZXJhdGlvbihjbSwgc2V0U2VsZWN0aW9uKShjbS5kb2MsIHNpbXBsZVNlbGVjdGlvbihwb3MpLCBzZWxfZG9udFNjcm9sbCk7XG5cbiAgICAgIHZhciBvbGRDU1MgPSB0ZS5zdHlsZS5jc3NUZXh0O1xuICAgICAgaW5wdXQud3JhcHBlci5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcbiAgICAgIHRlLnN0eWxlLmNzc1RleHQgPSBcInBvc2l0aW9uOiBmaXhlZDsgd2lkdGg6IDMwcHg7IGhlaWdodDogMzBweDsgdG9wOiBcIiArIChlLmNsaWVudFkgLSA1KSArXG4gICAgICAgIFwicHg7IGxlZnQ6IFwiICsgKGUuY2xpZW50WCAtIDUpICsgXCJweDsgei1pbmRleDogMTAwMDsgYmFja2dyb3VuZDogXCIgK1xuICAgICAgICAoaWUgPyBcInJnYmEoMjU1LCAyNTUsIDI1NSwgLjA1KVwiIDogXCJ0cmFuc3BhcmVudFwiKSArXG4gICAgICAgIFwiOyBvdXRsaW5lOiBub25lOyBib3JkZXItd2lkdGg6IDA7IG91dGxpbmU6IG5vbmU7IG92ZXJmbG93OiBoaWRkZW47IG9wYWNpdHk6IC4wNTsgZmlsdGVyOiBhbHBoYShvcGFjaXR5PTUpO1wiO1xuICAgICAgaWYgKHdlYmtpdCkgdmFyIG9sZFNjcm9sbFkgPSB3aW5kb3cuc2Nyb2xsWTsgLy8gV29yayBhcm91bmQgQ2hyb21lIGlzc3VlICgjMjcxMilcbiAgICAgIGRpc3BsYXkuaW5wdXQuZm9jdXMoKTtcbiAgICAgIGlmICh3ZWJraXQpIHdpbmRvdy5zY3JvbGxUbyhudWxsLCBvbGRTY3JvbGxZKTtcbiAgICAgIGRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgICAgIC8vIEFkZHMgXCJTZWxlY3QgYWxsXCIgdG8gY29udGV4dCBtZW51IGluIEZGXG4gICAgICBpZiAoIWNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHRlLnZhbHVlID0gaW5wdXQucHJldklucHV0ID0gXCIgXCI7XG4gICAgICBpbnB1dC5jb250ZXh0TWVudVBlbmRpbmcgPSB0cnVlO1xuICAgICAgZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSA9IGNtLmRvYy5zZWw7XG4gICAgICBjbGVhclRpbWVvdXQoZGlzcGxheS5kZXRlY3RpbmdTZWxlY3RBbGwpO1xuXG4gICAgICAvLyBTZWxlY3QtYWxsIHdpbGwgYmUgZ3JleWVkIG91dCBpZiB0aGVyZSdzIG5vdGhpbmcgdG8gc2VsZWN0LCBzb1xuICAgICAgLy8gdGhpcyBhZGRzIGEgemVyby13aWR0aCBzcGFjZSBzbyB0aGF0IHdlIGNhbiBsYXRlciBjaGVjayB3aGV0aGVyXG4gICAgICAvLyBpdCBnb3Qgc2VsZWN0ZWQuXG4gICAgICBmdW5jdGlvbiBwcmVwYXJlU2VsZWN0QWxsSGFjaygpIHtcbiAgICAgICAgaWYgKHRlLnNlbGVjdGlvblN0YXJ0ICE9IG51bGwpIHtcbiAgICAgICAgICB2YXIgc2VsZWN0ZWQgPSBjbS5zb21ldGhpbmdTZWxlY3RlZCgpO1xuICAgICAgICAgIHZhciBleHR2YWwgPSBcIlxcdTIwMGJcIiArIChzZWxlY3RlZCA/IHRlLnZhbHVlIDogXCJcIik7XG4gICAgICAgICAgdGUudmFsdWUgPSBcIlxcdTIxZGFcIjsgLy8gVXNlZCB0byBjYXRjaCBjb250ZXh0LW1lbnUgdW5kb1xuICAgICAgICAgIHRlLnZhbHVlID0gZXh0dmFsO1xuICAgICAgICAgIGlucHV0LnByZXZJbnB1dCA9IHNlbGVjdGVkID8gXCJcIiA6IFwiXFx1MjAwYlwiO1xuICAgICAgICAgIHRlLnNlbGVjdGlvblN0YXJ0ID0gMTsgdGUuc2VsZWN0aW9uRW5kID0gZXh0dmFsLmxlbmd0aDtcbiAgICAgICAgICAvLyBSZS1zZXQgdGhpcywgaW4gY2FzZSBzb21lIG90aGVyIGhhbmRsZXIgdG91Y2hlZCB0aGVcbiAgICAgICAgICAvLyBzZWxlY3Rpb24gaW4gdGhlIG1lYW50aW1lLlxuICAgICAgICAgIGRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUgPSBjbS5kb2Muc2VsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmdW5jdGlvbiByZWhpZGUoKSB7XG4gICAgICAgIGlucHV0LmNvbnRleHRNZW51UGVuZGluZyA9IGZhbHNlO1xuICAgICAgICBpbnB1dC53cmFwcGVyLnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuICAgICAgICB0ZS5zdHlsZS5jc3NUZXh0ID0gb2xkQ1NTO1xuICAgICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpIGRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxUb3AoZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3AgPSBzY3JvbGxQb3MpO1xuXG4gICAgICAgIC8vIFRyeSB0byBkZXRlY3QgdGhlIHVzZXIgY2hvb3Npbmcgc2VsZWN0LWFsbFxuICAgICAgICBpZiAodGUuc2VsZWN0aW9uU3RhcnQgIT0gbnVsbCkge1xuICAgICAgICAgIGlmICghaWUgfHwgKGllICYmIGllX3ZlcnNpb24gPCA5KSkgcHJlcGFyZVNlbGVjdEFsbEhhY2soKTtcbiAgICAgICAgICB2YXIgaSA9IDAsIHBvbGwgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChkaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ID09IGNtLmRvYy5zZWwgJiYgdGUuc2VsZWN0aW9uU3RhcnQgPT0gMCAmJlxuICAgICAgICAgICAgICAgIHRlLnNlbGVjdGlvbkVuZCA+IDAgJiYgaW5wdXQucHJldklucHV0ID09IFwiXFx1MjAwYlwiKVxuICAgICAgICAgICAgICBvcGVyYXRpb24oY20sIGNvbW1hbmRzLnNlbGVjdEFsbCkoY20pO1xuICAgICAgICAgICAgZWxzZSBpZiAoaSsrIDwgMTApIGRpc3BsYXkuZGV0ZWN0aW5nU2VsZWN0QWxsID0gc2V0VGltZW91dChwb2xsLCA1MDApO1xuICAgICAgICAgICAgZWxzZSBkaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgICAgICAgfTtcbiAgICAgICAgICBkaXNwbGF5LmRldGVjdGluZ1NlbGVjdEFsbCA9IHNldFRpbWVvdXQocG9sbCwgMjAwKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5KSBwcmVwYXJlU2VsZWN0QWxsSGFjaygpO1xuICAgICAgaWYgKGNhcHR1cmVSaWdodENsaWNrKSB7XG4gICAgICAgIGVfc3RvcChlKTtcbiAgICAgICAgdmFyIG1vdXNldXAgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICBvZmYod2luZG93LCBcIm1vdXNldXBcIiwgbW91c2V1cCk7XG4gICAgICAgICAgc2V0VGltZW91dChyZWhpZGUsIDIwKTtcbiAgICAgICAgfTtcbiAgICAgICAgb24od2luZG93LCBcIm1vdXNldXBcIiwgbW91c2V1cCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZXRUaW1lb3V0KHJlaGlkZSwgNTApO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICByZWFkT25seUNoYW5nZWQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgaWYgKCF2YWwpIHRoaXMucmVzZXQoKTtcbiAgICB9LFxuXG4gICAgc2V0VW5lZGl0YWJsZTogbm90aGluZyxcblxuICAgIG5lZWRzQ29udGVudEF0dHJpYnV0ZTogZmFsc2VcbiAgfSwgVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUpO1xuXG4gIC8vIENPTlRFTlRFRElUQUJMRSBJTlBVVCBTVFlMRVxuXG4gIGZ1bmN0aW9uIENvbnRlbnRFZGl0YWJsZUlucHV0KGNtKSB7XG4gICAgdGhpcy5jbSA9IGNtO1xuICAgIHRoaXMubGFzdEFuY2hvck5vZGUgPSB0aGlzLmxhc3RBbmNob3JPZmZzZXQgPSB0aGlzLmxhc3RGb2N1c05vZGUgPSB0aGlzLmxhc3RGb2N1c09mZnNldCA9IG51bGw7XG4gICAgdGhpcy5wb2xsaW5nID0gbmV3IERlbGF5ZWQoKTtcbiAgICB0aGlzLmdyYWNlUGVyaW9kID0gZmFsc2U7XG4gIH1cblxuICBDb250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUgPSBjb3B5T2JqKHtcbiAgICBpbml0OiBmdW5jdGlvbihkaXNwbGF5KSB7XG4gICAgICB2YXIgaW5wdXQgPSB0aGlzLCBjbSA9IGlucHV0LmNtO1xuICAgICAgdmFyIGRpdiA9IGlucHV0LmRpdiA9IGRpc3BsYXkubGluZURpdjtcbiAgICAgIGRpc2FibGVCcm93c2VyTWFnaWMoZGl2KTtcblxuICAgICAgb24oZGl2LCBcInBhc3RlXCIsIGZ1bmN0aW9uKGUpIHsgaGFuZGxlUGFzdGUoZSwgY20pOyB9KVxuXG4gICAgICBvbihkaXYsIFwiY29tcG9zaXRpb25zdGFydFwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIHZhciBkYXRhID0gZS5kYXRhO1xuICAgICAgICBpbnB1dC5jb21wb3NpbmcgPSB7c2VsOiBjbS5kb2Muc2VsLCBkYXRhOiBkYXRhLCBzdGFydERhdGE6IGRhdGF9O1xuICAgICAgICBpZiAoIWRhdGEpIHJldHVybjtcbiAgICAgICAgdmFyIHByaW0gPSBjbS5kb2Muc2VsLnByaW1hcnkoKTtcbiAgICAgICAgdmFyIGxpbmUgPSBjbS5nZXRMaW5lKHByaW0uaGVhZC5saW5lKTtcbiAgICAgICAgdmFyIGZvdW5kID0gbGluZS5pbmRleE9mKGRhdGEsIE1hdGgubWF4KDAsIHByaW0uaGVhZC5jaCAtIGRhdGEubGVuZ3RoKSk7XG4gICAgICAgIGlmIChmb3VuZCA+IC0xICYmIGZvdW5kIDw9IHByaW0uaGVhZC5jaClcbiAgICAgICAgICBpbnB1dC5jb21wb3Npbmcuc2VsID0gc2ltcGxlU2VsZWN0aW9uKFBvcyhwcmltLmhlYWQubGluZSwgZm91bmQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUG9zKHByaW0uaGVhZC5saW5lLCBmb3VuZCArIGRhdGEubGVuZ3RoKSk7XG4gICAgICB9KTtcbiAgICAgIG9uKGRpdiwgXCJjb21wb3NpdGlvbnVwZGF0ZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGlucHV0LmNvbXBvc2luZy5kYXRhID0gZS5kYXRhO1xuICAgICAgfSk7XG4gICAgICBvbihkaXYsIFwiY29tcG9zaXRpb25lbmRcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICB2YXIgb3VycyA9IGlucHV0LmNvbXBvc2luZztcbiAgICAgICAgaWYgKCFvdXJzKSByZXR1cm47XG4gICAgICAgIGlmIChlLmRhdGEgIT0gb3Vycy5zdGFydERhdGEgJiYgIS9cXHUyMDBiLy50ZXN0KGUuZGF0YSkpXG4gICAgICAgICAgb3Vycy5kYXRhID0gZS5kYXRhO1xuICAgICAgICAvLyBOZWVkIGEgc21hbGwgZGVsYXkgdG8gcHJldmVudCBvdGhlciBjb2RlIChpbnB1dCBldmVudCxcbiAgICAgICAgLy8gc2VsZWN0aW9uIHBvbGxpbmcpIGZyb20gZG9pbmcgZGFtYWdlIHdoZW4gZmlyZWQgcmlnaHQgYWZ0ZXJcbiAgICAgICAgLy8gY29tcG9zaXRpb25lbmQuXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgaWYgKCFvdXJzLmhhbmRsZWQpXG4gICAgICAgICAgICBpbnB1dC5hcHBseUNvbXBvc2l0aW9uKG91cnMpO1xuICAgICAgICAgIGlmIChpbnB1dC5jb21wb3NpbmcgPT0gb3VycylcbiAgICAgICAgICAgIGlucHV0LmNvbXBvc2luZyA9IG51bGw7XG4gICAgICAgIH0sIDUwKTtcbiAgICAgIH0pO1xuXG4gICAgICBvbihkaXYsIFwidG91Y2hzdGFydFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaW5wdXQuZm9yY2VDb21wb3NpdGlvbkVuZCgpO1xuICAgICAgfSk7XG5cbiAgICAgIG9uKGRpdiwgXCJpbnB1dFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKGlucHV0LmNvbXBvc2luZykgcmV0dXJuO1xuICAgICAgICBpZiAoaXNSZWFkT25seShjbSkgfHwgIWlucHV0LnBvbGxDb250ZW50KCkpXG4gICAgICAgICAgcnVuSW5PcChpbnB1dC5jbSwgZnVuY3Rpb24oKSB7cmVnQ2hhbmdlKGNtKTt9KTtcbiAgICAgIH0pO1xuXG4gICAgICBmdW5jdGlvbiBvbkNvcHlDdXQoZSkge1xuICAgICAgICBpZiAoY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkge1xuICAgICAgICAgIGxhc3RDb3BpZWQgPSBjbS5nZXRTZWxlY3Rpb25zKCk7XG4gICAgICAgICAgaWYgKGUudHlwZSA9PSBcImN1dFwiKSBjbS5yZXBsYWNlU2VsZWN0aW9uKFwiXCIsIG51bGwsIFwiY3V0XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKCFjbS5vcHRpb25zLmxpbmVXaXNlQ29weUN1dCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgcmFuZ2VzID0gY29weWFibGVSYW5nZXMoY20pO1xuICAgICAgICAgIGxhc3RDb3BpZWQgPSByYW5nZXMudGV4dDtcbiAgICAgICAgICBpZiAoZS50eXBlID09IFwiY3V0XCIpIHtcbiAgICAgICAgICAgIGNtLm9wZXJhdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgY20uc2V0U2VsZWN0aW9ucyhyYW5nZXMucmFuZ2VzLCAwLCBzZWxfZG9udFNjcm9sbCk7XG4gICAgICAgICAgICAgIGNtLnJlcGxhY2VTZWxlY3Rpb24oXCJcIiwgbnVsbCwgXCJjdXRcIik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gaU9TIGV4cG9zZXMgdGhlIGNsaXBib2FyZCBBUEksIGJ1dCBzZWVtcyB0byBkaXNjYXJkIGNvbnRlbnQgaW5zZXJ0ZWQgaW50byBpdFxuICAgICAgICBpZiAoZS5jbGlwYm9hcmREYXRhICYmICFpb3MpIHtcbiAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgZS5jbGlwYm9hcmREYXRhLmNsZWFyRGF0YSgpO1xuICAgICAgICAgIGUuY2xpcGJvYXJkRGF0YS5zZXREYXRhKFwidGV4dC9wbGFpblwiLCBsYXN0Q29waWVkLmpvaW4oXCJcXG5cIikpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE9sZC1mYXNoaW9uZWQgYnJpZWZseS1mb2N1cy1hLXRleHRhcmVhIGhhY2tcbiAgICAgICAgICB2YXIga2x1ZGdlID0gaGlkZGVuVGV4dGFyZWEoKSwgdGUgPSBrbHVkZ2UuZmlyc3RDaGlsZDtcbiAgICAgICAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5pbnNlcnRCZWZvcmUoa2x1ZGdlLCBjbS5kaXNwbGF5LmxpbmVTcGFjZS5maXJzdENoaWxkKTtcbiAgICAgICAgICB0ZS52YWx1ZSA9IGxhc3RDb3BpZWQuam9pbihcIlxcblwiKTtcbiAgICAgICAgICB2YXIgaGFkRm9jdXMgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuICAgICAgICAgIHNlbGVjdElucHV0KHRlKTtcbiAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY20uZGlzcGxheS5saW5lU3BhY2UucmVtb3ZlQ2hpbGQoa2x1ZGdlKTtcbiAgICAgICAgICAgIGhhZEZvY3VzLmZvY3VzKCk7XG4gICAgICAgICAgfSwgNTApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBvbihkaXYsIFwiY29weVwiLCBvbkNvcHlDdXQpO1xuICAgICAgb24oZGl2LCBcImN1dFwiLCBvbkNvcHlDdXQpO1xuICAgIH0sXG5cbiAgICBwcmVwYXJlU2VsZWN0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciByZXN1bHQgPSBwcmVwYXJlU2VsZWN0aW9uKHRoaXMuY20sIGZhbHNlKTtcbiAgICAgIHJlc3VsdC5mb2N1cyA9IHRoaXMuY20uc3RhdGUuZm9jdXNlZDtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSxcblxuICAgIHNob3dTZWxlY3Rpb246IGZ1bmN0aW9uKGluZm8pIHtcbiAgICAgIGlmICghaW5mbyB8fCAhdGhpcy5jbS5kaXNwbGF5LnZpZXcubGVuZ3RoKSByZXR1cm47XG4gICAgICBpZiAoaW5mby5mb2N1cykgdGhpcy5zaG93UHJpbWFyeVNlbGVjdGlvbigpO1xuICAgICAgdGhpcy5zaG93TXVsdGlwbGVTZWxlY3Rpb25zKGluZm8pO1xuICAgIH0sXG5cbiAgICBzaG93UHJpbWFyeVNlbGVjdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpLCBwcmltID0gdGhpcy5jbS5kb2Muc2VsLnByaW1hcnkoKTtcbiAgICAgIHZhciBjdXJBbmNob3IgPSBkb21Ub1Bvcyh0aGlzLmNtLCBzZWwuYW5jaG9yTm9kZSwgc2VsLmFuY2hvck9mZnNldCk7XG4gICAgICB2YXIgY3VyRm9jdXMgPSBkb21Ub1Bvcyh0aGlzLmNtLCBzZWwuZm9jdXNOb2RlLCBzZWwuZm9jdXNPZmZzZXQpO1xuICAgICAgaWYgKGN1ckFuY2hvciAmJiAhY3VyQW5jaG9yLmJhZCAmJiBjdXJGb2N1cyAmJiAhY3VyRm9jdXMuYmFkICYmXG4gICAgICAgICAgY21wKG1pblBvcyhjdXJBbmNob3IsIGN1ckZvY3VzKSwgcHJpbS5mcm9tKCkpID09IDAgJiZcbiAgICAgICAgICBjbXAobWF4UG9zKGN1ckFuY2hvciwgY3VyRm9jdXMpLCBwcmltLnRvKCkpID09IDApXG4gICAgICAgIHJldHVybjtcblxuICAgICAgdmFyIHN0YXJ0ID0gcG9zVG9ET00odGhpcy5jbSwgcHJpbS5mcm9tKCkpO1xuICAgICAgdmFyIGVuZCA9IHBvc1RvRE9NKHRoaXMuY20sIHByaW0udG8oKSk7XG4gICAgICBpZiAoIXN0YXJ0ICYmICFlbmQpIHJldHVybjtcblxuICAgICAgdmFyIHZpZXcgPSB0aGlzLmNtLmRpc3BsYXkudmlldztcbiAgICAgIHZhciBvbGQgPSBzZWwucmFuZ2VDb3VudCAmJiBzZWwuZ2V0UmFuZ2VBdCgwKTtcbiAgICAgIGlmICghc3RhcnQpIHtcbiAgICAgICAgc3RhcnQgPSB7bm9kZTogdmlld1swXS5tZWFzdXJlLm1hcFsyXSwgb2Zmc2V0OiAwfTtcbiAgICAgIH0gZWxzZSBpZiAoIWVuZCkgeyAvLyBGSVhNRSBkYW5nZXJvdXNseSBoYWNreVxuICAgICAgICB2YXIgbWVhc3VyZSA9IHZpZXdbdmlldy5sZW5ndGggLSAxXS5tZWFzdXJlO1xuICAgICAgICB2YXIgbWFwID0gbWVhc3VyZS5tYXBzID8gbWVhc3VyZS5tYXBzW21lYXN1cmUubWFwcy5sZW5ndGggLSAxXSA6IG1lYXN1cmUubWFwO1xuICAgICAgICBlbmQgPSB7bm9kZTogbWFwW21hcC5sZW5ndGggLSAxXSwgb2Zmc2V0OiBtYXBbbWFwLmxlbmd0aCAtIDJdIC0gbWFwW21hcC5sZW5ndGggLSAzXX07XG4gICAgICB9XG5cbiAgICAgIHRyeSB7IHZhciBybmcgPSByYW5nZShzdGFydC5ub2RlLCBzdGFydC5vZmZzZXQsIGVuZC5vZmZzZXQsIGVuZC5ub2RlKTsgfVxuICAgICAgY2F0Y2goZSkge30gLy8gT3VyIG1vZGVsIG9mIHRoZSBET00gbWlnaHQgYmUgb3V0ZGF0ZWQsIGluIHdoaWNoIGNhc2UgdGhlIHJhbmdlIHdlIHRyeSB0byBzZXQgY2FuIGJlIGltcG9zc2libGVcbiAgICAgIGlmIChybmcpIHtcbiAgICAgICAgc2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuICAgICAgICBzZWwuYWRkUmFuZ2Uocm5nKTtcbiAgICAgICAgaWYgKG9sZCAmJiBzZWwuYW5jaG9yTm9kZSA9PSBudWxsKSBzZWwuYWRkUmFuZ2Uob2xkKTtcbiAgICAgICAgZWxzZSBpZiAoZ2Vja28pIHRoaXMuc3RhcnRHcmFjZVBlcmlvZCgpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZW1lbWJlclNlbGVjdGlvbigpO1xuICAgIH0sXG5cbiAgICBzdGFydEdyYWNlUGVyaW9kOiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBpbnB1dCA9IHRoaXM7XG4gICAgICBjbGVhclRpbWVvdXQodGhpcy5ncmFjZVBlcmlvZCk7XG4gICAgICB0aGlzLmdyYWNlUGVyaW9kID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgaW5wdXQuZ3JhY2VQZXJpb2QgPSBmYWxzZTtcbiAgICAgICAgaWYgKGlucHV0LnNlbGVjdGlvbkNoYW5nZWQoKSlcbiAgICAgICAgICBpbnB1dC5jbS5vcGVyYXRpb24oZnVuY3Rpb24oKSB7IGlucHV0LmNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlOyB9KTtcbiAgICAgIH0sIDIwKTtcbiAgICB9LFxuXG4gICAgc2hvd011bHRpcGxlU2VsZWN0aW9uczogZnVuY3Rpb24oaW5mbykge1xuICAgICAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQodGhpcy5jbS5kaXNwbGF5LmN1cnNvckRpdiwgaW5mby5jdXJzb3JzKTtcbiAgICAgIHJlbW92ZUNoaWxkcmVuQW5kQWRkKHRoaXMuY20uZGlzcGxheS5zZWxlY3Rpb25EaXYsIGluZm8uc2VsZWN0aW9uKTtcbiAgICB9LFxuXG4gICAgcmVtZW1iZXJTZWxlY3Rpb246IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICAgIHRoaXMubGFzdEFuY2hvck5vZGUgPSBzZWwuYW5jaG9yTm9kZTsgdGhpcy5sYXN0QW5jaG9yT2Zmc2V0ID0gc2VsLmFuY2hvck9mZnNldDtcbiAgICAgIHRoaXMubGFzdEZvY3VzTm9kZSA9IHNlbC5mb2N1c05vZGU7IHRoaXMubGFzdEZvY3VzT2Zmc2V0ID0gc2VsLmZvY3VzT2Zmc2V0O1xuICAgIH0sXG5cbiAgICBzZWxlY3Rpb25JbkVkaXRvcjogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgICAgaWYgKCFzZWwucmFuZ2VDb3VudCkgcmV0dXJuIGZhbHNlO1xuICAgICAgdmFyIG5vZGUgPSBzZWwuZ2V0UmFuZ2VBdCgwKS5jb21tb25BbmNlc3RvckNvbnRhaW5lcjtcbiAgICAgIHJldHVybiBjb250YWlucyh0aGlzLmRpdiwgbm9kZSk7XG4gICAgfSxcblxuICAgIGZvY3VzOiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICh0aGlzLmNtLm9wdGlvbnMucmVhZE9ubHkgIT0gXCJub2N1cnNvclwiKSB0aGlzLmRpdi5mb2N1cygpO1xuICAgIH0sXG4gICAgYmx1cjogZnVuY3Rpb24oKSB7IHRoaXMuZGl2LmJsdXIoKTsgfSxcbiAgICBnZXRGaWVsZDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRpdjsgfSxcblxuICAgIHN1cHBvcnRzVG91Y2g6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfSxcblxuICAgIHJlY2VpdmVkRm9jdXM6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGlucHV0ID0gdGhpcztcbiAgICAgIGlmICh0aGlzLnNlbGVjdGlvbkluRWRpdG9yKCkpXG4gICAgICAgIHRoaXMucG9sbFNlbGVjdGlvbigpO1xuICAgICAgZWxzZVxuICAgICAgICBydW5Jbk9wKHRoaXMuY20sIGZ1bmN0aW9uKCkgeyBpbnB1dC5jbS5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gdHJ1ZTsgfSk7XG5cbiAgICAgIGZ1bmN0aW9uIHBvbGwoKSB7XG4gICAgICAgIGlmIChpbnB1dC5jbS5zdGF0ZS5mb2N1c2VkKSB7XG4gICAgICAgICAgaW5wdXQucG9sbFNlbGVjdGlvbigpO1xuICAgICAgICAgIGlucHV0LnBvbGxpbmcuc2V0KGlucHV0LmNtLm9wdGlvbnMucG9sbEludGVydmFsLCBwb2xsKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5wb2xsaW5nLnNldCh0aGlzLmNtLm9wdGlvbnMucG9sbEludGVydmFsLCBwb2xsKTtcbiAgICB9LFxuXG4gICAgc2VsZWN0aW9uQ2hhbmdlZDogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgICAgcmV0dXJuIHNlbC5hbmNob3JOb2RlICE9IHRoaXMubGFzdEFuY2hvck5vZGUgfHwgc2VsLmFuY2hvck9mZnNldCAhPSB0aGlzLmxhc3RBbmNob3JPZmZzZXQgfHxcbiAgICAgICAgc2VsLmZvY3VzTm9kZSAhPSB0aGlzLmxhc3RGb2N1c05vZGUgfHwgc2VsLmZvY3VzT2Zmc2V0ICE9IHRoaXMubGFzdEZvY3VzT2Zmc2V0O1xuICAgIH0sXG5cbiAgICBwb2xsU2VsZWN0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICghdGhpcy5jb21wb3NpbmcgJiYgIXRoaXMuZ3JhY2VQZXJpb2QgJiYgdGhpcy5zZWxlY3Rpb25DaGFuZ2VkKCkpIHtcbiAgICAgICAgdmFyIHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKSwgY20gPSB0aGlzLmNtO1xuICAgICAgICB0aGlzLnJlbWVtYmVyU2VsZWN0aW9uKCk7XG4gICAgICAgIHZhciBhbmNob3IgPSBkb21Ub1BvcyhjbSwgc2VsLmFuY2hvck5vZGUsIHNlbC5hbmNob3JPZmZzZXQpO1xuICAgICAgICB2YXIgaGVhZCA9IGRvbVRvUG9zKGNtLCBzZWwuZm9jdXNOb2RlLCBzZWwuZm9jdXNPZmZzZXQpO1xuICAgICAgICBpZiAoYW5jaG9yICYmIGhlYWQpIHJ1bkluT3AoY20sIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHNldFNlbGVjdGlvbihjbS5kb2MsIHNpbXBsZVNlbGVjdGlvbihhbmNob3IsIGhlYWQpLCBzZWxfZG9udFNjcm9sbCk7XG4gICAgICAgICAgaWYgKGFuY2hvci5iYWQgfHwgaGVhZC5iYWQpIGNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgcG9sbENvbnRlbnQ6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGNtID0gdGhpcy5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXksIHNlbCA9IGNtLmRvYy5zZWwucHJpbWFyeSgpO1xuICAgICAgdmFyIGZyb20gPSBzZWwuZnJvbSgpLCB0byA9IHNlbC50bygpO1xuICAgICAgaWYgKGZyb20ubGluZSA8IGRpc3BsYXkudmlld0Zyb20gfHwgdG8ubGluZSA+IGRpc3BsYXkudmlld1RvIC0gMSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICB2YXIgZnJvbUluZGV4O1xuICAgICAgaWYgKGZyb20ubGluZSA9PSBkaXNwbGF5LnZpZXdGcm9tIHx8IChmcm9tSW5kZXggPSBmaW5kVmlld0luZGV4KGNtLCBmcm9tLmxpbmUpKSA9PSAwKSB7XG4gICAgICAgIHZhciBmcm9tTGluZSA9IGxpbmVObyhkaXNwbGF5LnZpZXdbMF0ubGluZSk7XG4gICAgICAgIHZhciBmcm9tTm9kZSA9IGRpc3BsYXkudmlld1swXS5ub2RlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGZyb21MaW5lID0gbGluZU5vKGRpc3BsYXkudmlld1tmcm9tSW5kZXhdLmxpbmUpO1xuICAgICAgICB2YXIgZnJvbU5vZGUgPSBkaXNwbGF5LnZpZXdbZnJvbUluZGV4IC0gMV0ubm9kZS5uZXh0U2libGluZztcbiAgICAgIH1cbiAgICAgIHZhciB0b0luZGV4ID0gZmluZFZpZXdJbmRleChjbSwgdG8ubGluZSk7XG4gICAgICBpZiAodG9JbmRleCA9PSBkaXNwbGF5LnZpZXcubGVuZ3RoIC0gMSkge1xuICAgICAgICB2YXIgdG9MaW5lID0gZGlzcGxheS52aWV3VG8gLSAxO1xuICAgICAgICB2YXIgdG9Ob2RlID0gZGlzcGxheS5saW5lRGl2Lmxhc3RDaGlsZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB0b0xpbmUgPSBsaW5lTm8oZGlzcGxheS52aWV3W3RvSW5kZXggKyAxXS5saW5lKSAtIDE7XG4gICAgICAgIHZhciB0b05vZGUgPSBkaXNwbGF5LnZpZXdbdG9JbmRleCArIDFdLm5vZGUucHJldmlvdXNTaWJsaW5nO1xuICAgICAgfVxuXG4gICAgICB2YXIgbmV3VGV4dCA9IGNtLmRvYy5zcGxpdExpbmVzKGRvbVRleHRCZXR3ZWVuKGNtLCBmcm9tTm9kZSwgdG9Ob2RlLCBmcm9tTGluZSwgdG9MaW5lKSk7XG4gICAgICB2YXIgb2xkVGV4dCA9IGdldEJldHdlZW4oY20uZG9jLCBQb3MoZnJvbUxpbmUsIDApLCBQb3ModG9MaW5lLCBnZXRMaW5lKGNtLmRvYywgdG9MaW5lKS50ZXh0Lmxlbmd0aCkpO1xuICAgICAgd2hpbGUgKG5ld1RleHQubGVuZ3RoID4gMSAmJiBvbGRUZXh0Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgaWYgKGxzdChuZXdUZXh0KSA9PSBsc3Qob2xkVGV4dCkpIHsgbmV3VGV4dC5wb3AoKTsgb2xkVGV4dC5wb3AoKTsgdG9MaW5lLS07IH1cbiAgICAgICAgZWxzZSBpZiAobmV3VGV4dFswXSA9PSBvbGRUZXh0WzBdKSB7IG5ld1RleHQuc2hpZnQoKTsgb2xkVGV4dC5zaGlmdCgpOyBmcm9tTGluZSsrOyB9XG4gICAgICAgIGVsc2UgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHZhciBjdXRGcm9udCA9IDAsIGN1dEVuZCA9IDA7XG4gICAgICB2YXIgbmV3VG9wID0gbmV3VGV4dFswXSwgb2xkVG9wID0gb2xkVGV4dFswXSwgbWF4Q3V0RnJvbnQgPSBNYXRoLm1pbihuZXdUb3AubGVuZ3RoLCBvbGRUb3AubGVuZ3RoKTtcbiAgICAgIHdoaWxlIChjdXRGcm9udCA8IG1heEN1dEZyb250ICYmIG5ld1RvcC5jaGFyQ29kZUF0KGN1dEZyb250KSA9PSBvbGRUb3AuY2hhckNvZGVBdChjdXRGcm9udCkpXG4gICAgICAgICsrY3V0RnJvbnQ7XG4gICAgICB2YXIgbmV3Qm90ID0gbHN0KG5ld1RleHQpLCBvbGRCb3QgPSBsc3Qob2xkVGV4dCk7XG4gICAgICB2YXIgbWF4Q3V0RW5kID0gTWF0aC5taW4obmV3Qm90Lmxlbmd0aCAtIChuZXdUZXh0Lmxlbmd0aCA9PSAxID8gY3V0RnJvbnQgOiAwKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbGRCb3QubGVuZ3RoIC0gKG9sZFRleHQubGVuZ3RoID09IDEgPyBjdXRGcm9udCA6IDApKTtcbiAgICAgIHdoaWxlIChjdXRFbmQgPCBtYXhDdXRFbmQgJiZcbiAgICAgICAgICAgICBuZXdCb3QuY2hhckNvZGVBdChuZXdCb3QubGVuZ3RoIC0gY3V0RW5kIC0gMSkgPT0gb2xkQm90LmNoYXJDb2RlQXQob2xkQm90Lmxlbmd0aCAtIGN1dEVuZCAtIDEpKVxuICAgICAgICArK2N1dEVuZDtcblxuICAgICAgbmV3VGV4dFtuZXdUZXh0Lmxlbmd0aCAtIDFdID0gbmV3Qm90LnNsaWNlKDAsIG5ld0JvdC5sZW5ndGggLSBjdXRFbmQpO1xuICAgICAgbmV3VGV4dFswXSA9IG5ld1RleHRbMF0uc2xpY2UoY3V0RnJvbnQpO1xuXG4gICAgICB2YXIgY2hGcm9tID0gUG9zKGZyb21MaW5lLCBjdXRGcm9udCk7XG4gICAgICB2YXIgY2hUbyA9IFBvcyh0b0xpbmUsIG9sZFRleHQubGVuZ3RoID8gbHN0KG9sZFRleHQpLmxlbmd0aCAtIGN1dEVuZCA6IDApO1xuICAgICAgaWYgKG5ld1RleHQubGVuZ3RoID4gMSB8fCBuZXdUZXh0WzBdIHx8IGNtcChjaEZyb20sIGNoVG8pKSB7XG4gICAgICAgIHJlcGxhY2VSYW5nZShjbS5kb2MsIG5ld1RleHQsIGNoRnJvbSwgY2hUbywgXCIraW5wdXRcIik7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBlbnN1cmVQb2xsZWQ6IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5mb3JjZUNvbXBvc2l0aW9uRW5kKCk7XG4gICAgfSxcbiAgICByZXNldDogZnVuY3Rpb24oKSB7XG4gICAgICB0aGlzLmZvcmNlQ29tcG9zaXRpb25FbmQoKTtcbiAgICB9LFxuICAgIGZvcmNlQ29tcG9zaXRpb25FbmQ6IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCF0aGlzLmNvbXBvc2luZyB8fCB0aGlzLmNvbXBvc2luZy5oYW5kbGVkKSByZXR1cm47XG4gICAgICB0aGlzLmFwcGx5Q29tcG9zaXRpb24odGhpcy5jb21wb3NpbmcpO1xuICAgICAgdGhpcy5jb21wb3NpbmcuaGFuZGxlZCA9IHRydWU7XG4gICAgICB0aGlzLmRpdi5ibHVyKCk7XG4gICAgICB0aGlzLmRpdi5mb2N1cygpO1xuICAgIH0sXG4gICAgYXBwbHlDb21wb3NpdGlvbjogZnVuY3Rpb24oY29tcG9zaW5nKSB7XG4gICAgICBpZiAoaXNSZWFkT25seSh0aGlzLmNtKSlcbiAgICAgICAgb3BlcmF0aW9uKHRoaXMuY20sIHJlZ0NoYW5nZSkodGhpcy5jbSlcbiAgICAgIGVsc2UgaWYgKGNvbXBvc2luZy5kYXRhICYmIGNvbXBvc2luZy5kYXRhICE9IGNvbXBvc2luZy5zdGFydERhdGEpXG4gICAgICAgIG9wZXJhdGlvbih0aGlzLmNtLCBhcHBseVRleHRJbnB1dCkodGhpcy5jbSwgY29tcG9zaW5nLmRhdGEsIDAsIGNvbXBvc2luZy5zZWwpO1xuICAgIH0sXG5cbiAgICBzZXRVbmVkaXRhYmxlOiBmdW5jdGlvbihub2RlKSB7XG4gICAgICBub2RlLmNvbnRlbnRFZGl0YWJsZSA9IFwiZmFsc2VcIlxuICAgIH0sXG5cbiAgICBvbktleVByZXNzOiBmdW5jdGlvbihlKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBpZiAoIWlzUmVhZE9ubHkodGhpcy5jbSkpXG4gICAgICAgIG9wZXJhdGlvbih0aGlzLmNtLCBhcHBseVRleHRJbnB1dCkodGhpcy5jbSwgU3RyaW5nLmZyb21DaGFyQ29kZShlLmNoYXJDb2RlID09IG51bGwgPyBlLmtleUNvZGUgOiBlLmNoYXJDb2RlKSwgMCk7XG4gICAgfSxcblxuICAgIHJlYWRPbmx5Q2hhbmdlZDogZnVuY3Rpb24odmFsKSB7XG4gICAgICB0aGlzLmRpdi5jb250ZW50RWRpdGFibGUgPSBTdHJpbmcodmFsICE9IFwibm9jdXJzb3JcIilcbiAgICB9LFxuXG4gICAgb25Db250ZXh0TWVudTogbm90aGluZyxcbiAgICByZXNldFBvc2l0aW9uOiBub3RoaW5nLFxuXG4gICAgbmVlZHNDb250ZW50QXR0cmlidXRlOiB0cnVlXG4gIH0sIENvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZSk7XG5cbiAgZnVuY3Rpb24gcG9zVG9ET00oY20sIHBvcykge1xuICAgIHZhciB2aWV3ID0gZmluZFZpZXdGb3JMaW5lKGNtLCBwb3MubGluZSk7XG4gICAgaWYgKCF2aWV3IHx8IHZpZXcuaGlkZGVuKSByZXR1cm4gbnVsbDtcbiAgICB2YXIgbGluZSA9IGdldExpbmUoY20uZG9jLCBwb3MubGluZSk7XG4gICAgdmFyIGluZm8gPSBtYXBGcm9tTGluZVZpZXcodmlldywgbGluZSwgcG9zLmxpbmUpO1xuXG4gICAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZSksIHNpZGUgPSBcImxlZnRcIjtcbiAgICBpZiAob3JkZXIpIHtcbiAgICAgIHZhciBwYXJ0UG9zID0gZ2V0QmlkaVBhcnRBdChvcmRlciwgcG9zLmNoKTtcbiAgICAgIHNpZGUgPSBwYXJ0UG9zICUgMiA/IFwicmlnaHRcIiA6IFwibGVmdFwiO1xuICAgIH1cbiAgICB2YXIgcmVzdWx0ID0gbm9kZUFuZE9mZnNldEluTGluZU1hcChpbmZvLm1hcCwgcG9zLmNoLCBzaWRlKTtcbiAgICByZXN1bHQub2Zmc2V0ID0gcmVzdWx0LmNvbGxhcHNlID09IFwicmlnaHRcIiA/IHJlc3VsdC5lbmQgOiByZXN1bHQuc3RhcnQ7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJhZFBvcyhwb3MsIGJhZCkgeyBpZiAoYmFkKSBwb3MuYmFkID0gdHJ1ZTsgcmV0dXJuIHBvczsgfVxuXG4gIGZ1bmN0aW9uIGRvbVRvUG9zKGNtLCBub2RlLCBvZmZzZXQpIHtcbiAgICB2YXIgbGluZU5vZGU7XG4gICAgaWYgKG5vZGUgPT0gY20uZGlzcGxheS5saW5lRGl2KSB7XG4gICAgICBsaW5lTm9kZSA9IGNtLmRpc3BsYXkubGluZURpdi5jaGlsZE5vZGVzW29mZnNldF07XG4gICAgICBpZiAoIWxpbmVOb2RlKSByZXR1cm4gYmFkUG9zKGNtLmNsaXBQb3MoUG9zKGNtLmRpc3BsYXkudmlld1RvIC0gMSkpLCB0cnVlKTtcbiAgICAgIG5vZGUgPSBudWxsOyBvZmZzZXQgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGxpbmVOb2RlID0gbm9kZTs7IGxpbmVOb2RlID0gbGluZU5vZGUucGFyZW50Tm9kZSkge1xuICAgICAgICBpZiAoIWxpbmVOb2RlIHx8IGxpbmVOb2RlID09IGNtLmRpc3BsYXkubGluZURpdikgcmV0dXJuIG51bGw7XG4gICAgICAgIGlmIChsaW5lTm9kZS5wYXJlbnROb2RlICYmIGxpbmVOb2RlLnBhcmVudE5vZGUgPT0gY20uZGlzcGxheS5saW5lRGl2KSBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbS5kaXNwbGF5LnZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBsaW5lVmlldyA9IGNtLmRpc3BsYXkudmlld1tpXTtcbiAgICAgIGlmIChsaW5lVmlldy5ub2RlID09IGxpbmVOb2RlKVxuICAgICAgICByZXR1cm4gbG9jYXRlTm9kZUluTGluZVZpZXcobGluZVZpZXcsIG5vZGUsIG9mZnNldCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gbG9jYXRlTm9kZUluTGluZVZpZXcobGluZVZpZXcsIG5vZGUsIG9mZnNldCkge1xuICAgIHZhciB3cmFwcGVyID0gbGluZVZpZXcudGV4dC5maXJzdENoaWxkLCBiYWQgPSBmYWxzZTtcbiAgICBpZiAoIW5vZGUgfHwgIWNvbnRhaW5zKHdyYXBwZXIsIG5vZGUpKSByZXR1cm4gYmFkUG9zKFBvcyhsaW5lTm8obGluZVZpZXcubGluZSksIDApLCB0cnVlKTtcbiAgICBpZiAobm9kZSA9PSB3cmFwcGVyKSB7XG4gICAgICBiYWQgPSB0cnVlO1xuICAgICAgbm9kZSA9IHdyYXBwZXIuY2hpbGROb2Rlc1tvZmZzZXRdO1xuICAgICAgb2Zmc2V0ID0gMDtcbiAgICAgIGlmICghbm9kZSkge1xuICAgICAgICB2YXIgbGluZSA9IGxpbmVWaWV3LnJlc3QgPyBsc3QobGluZVZpZXcucmVzdCkgOiBsaW5lVmlldy5saW5lO1xuICAgICAgICByZXR1cm4gYmFkUG9zKFBvcyhsaW5lTm8obGluZSksIGxpbmUudGV4dC5sZW5ndGgpLCBiYWQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciB0ZXh0Tm9kZSA9IG5vZGUubm9kZVR5cGUgPT0gMyA/IG5vZGUgOiBudWxsLCB0b3BOb2RlID0gbm9kZTtcbiAgICBpZiAoIXRleHROb2RlICYmIG5vZGUuY2hpbGROb2Rlcy5sZW5ndGggPT0gMSAmJiBub2RlLmZpcnN0Q2hpbGQubm9kZVR5cGUgPT0gMykge1xuICAgICAgdGV4dE5vZGUgPSBub2RlLmZpcnN0Q2hpbGQ7XG4gICAgICBpZiAob2Zmc2V0KSBvZmZzZXQgPSB0ZXh0Tm9kZS5ub2RlVmFsdWUubGVuZ3RoO1xuICAgIH1cbiAgICB3aGlsZSAodG9wTm9kZS5wYXJlbnROb2RlICE9IHdyYXBwZXIpIHRvcE5vZGUgPSB0b3BOb2RlLnBhcmVudE5vZGU7XG4gICAgdmFyIG1lYXN1cmUgPSBsaW5lVmlldy5tZWFzdXJlLCBtYXBzID0gbWVhc3VyZS5tYXBzO1xuXG4gICAgZnVuY3Rpb24gZmluZCh0ZXh0Tm9kZSwgdG9wTm9kZSwgb2Zmc2V0KSB7XG4gICAgICBmb3IgKHZhciBpID0gLTE7IGkgPCAobWFwcyA/IG1hcHMubGVuZ3RoIDogMCk7IGkrKykge1xuICAgICAgICB2YXIgbWFwID0gaSA8IDAgPyBtZWFzdXJlLm1hcCA6IG1hcHNbaV07XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbWFwLmxlbmd0aDsgaiArPSAzKSB7XG4gICAgICAgICAgdmFyIGN1ck5vZGUgPSBtYXBbaiArIDJdO1xuICAgICAgICAgIGlmIChjdXJOb2RlID09IHRleHROb2RlIHx8IGN1ck5vZGUgPT0gdG9wTm9kZSkge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBsaW5lTm8oaSA8IDAgPyBsaW5lVmlldy5saW5lIDogbGluZVZpZXcucmVzdFtpXSk7XG4gICAgICAgICAgICB2YXIgY2ggPSBtYXBbal0gKyBvZmZzZXQ7XG4gICAgICAgICAgICBpZiAob2Zmc2V0IDwgMCB8fCBjdXJOb2RlICE9IHRleHROb2RlKSBjaCA9IG1hcFtqICsgKG9mZnNldCA/IDEgOiAwKV07XG4gICAgICAgICAgICByZXR1cm4gUG9zKGxpbmUsIGNoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIGZvdW5kID0gZmluZCh0ZXh0Tm9kZSwgdG9wTm9kZSwgb2Zmc2V0KTtcbiAgICBpZiAoZm91bmQpIHJldHVybiBiYWRQb3MoZm91bmQsIGJhZCk7XG5cbiAgICAvLyBGSVhNRSB0aGlzIGlzIGFsbCByZWFsbHkgc2hha3kuIG1pZ2h0IGhhbmRsZSB0aGUgZmV3IGNhc2VzIGl0IG5lZWRzIHRvIGhhbmRsZSwgYnV0IGxpa2VseSB0byBjYXVzZSBwcm9ibGVtc1xuICAgIGZvciAodmFyIGFmdGVyID0gdG9wTm9kZS5uZXh0U2libGluZywgZGlzdCA9IHRleHROb2RlID8gdGV4dE5vZGUubm9kZVZhbHVlLmxlbmd0aCAtIG9mZnNldCA6IDA7IGFmdGVyOyBhZnRlciA9IGFmdGVyLm5leHRTaWJsaW5nKSB7XG4gICAgICBmb3VuZCA9IGZpbmQoYWZ0ZXIsIGFmdGVyLmZpcnN0Q2hpbGQsIDApO1xuICAgICAgaWYgKGZvdW5kKVxuICAgICAgICByZXR1cm4gYmFkUG9zKFBvcyhmb3VuZC5saW5lLCBmb3VuZC5jaCAtIGRpc3QpLCBiYWQpO1xuICAgICAgZWxzZVxuICAgICAgICBkaXN0ICs9IGFmdGVyLnRleHRDb250ZW50Lmxlbmd0aDtcbiAgICB9XG4gICAgZm9yICh2YXIgYmVmb3JlID0gdG9wTm9kZS5wcmV2aW91c1NpYmxpbmcsIGRpc3QgPSBvZmZzZXQ7IGJlZm9yZTsgYmVmb3JlID0gYmVmb3JlLnByZXZpb3VzU2libGluZykge1xuICAgICAgZm91bmQgPSBmaW5kKGJlZm9yZSwgYmVmb3JlLmZpcnN0Q2hpbGQsIC0xKTtcbiAgICAgIGlmIChmb3VuZClcbiAgICAgICAgcmV0dXJuIGJhZFBvcyhQb3MoZm91bmQubGluZSwgZm91bmQuY2ggKyBkaXN0KSwgYmFkKTtcbiAgICAgIGVsc2VcbiAgICAgICAgZGlzdCArPSBhZnRlci50ZXh0Q29udGVudC5sZW5ndGg7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZG9tVGV4dEJldHdlZW4oY20sIGZyb20sIHRvLCBmcm9tTGluZSwgdG9MaW5lKSB7XG4gICAgdmFyIHRleHQgPSBcIlwiLCBjbG9zaW5nID0gZmFsc2UsIGxpbmVTZXAgPSBjbS5kb2MubGluZVNlcGFyYXRvcigpO1xuICAgIGZ1bmN0aW9uIHJlY29nbml6ZU1hcmtlcihpZCkgeyByZXR1cm4gZnVuY3Rpb24obWFya2VyKSB7IHJldHVybiBtYXJrZXIuaWQgPT0gaWQ7IH07IH1cbiAgICBmdW5jdGlvbiB3YWxrKG5vZGUpIHtcbiAgICAgIGlmIChub2RlLm5vZGVUeXBlID09IDEpIHtcbiAgICAgICAgdmFyIGNtVGV4dCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiY20tdGV4dFwiKTtcbiAgICAgICAgaWYgKGNtVGV4dCAhPSBudWxsKSB7XG4gICAgICAgICAgaWYgKGNtVGV4dCA9PSBcIlwiKSBjbVRleHQgPSBub2RlLnRleHRDb250ZW50LnJlcGxhY2UoL1xcdTIwMGIvZywgXCJcIik7XG4gICAgICAgICAgdGV4dCArPSBjbVRleHQ7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBtYXJrZXJJRCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiY20tbWFya2VyXCIpLCByYW5nZTtcbiAgICAgICAgaWYgKG1hcmtlcklEKSB7XG4gICAgICAgICAgdmFyIGZvdW5kID0gY20uZmluZE1hcmtzKFBvcyhmcm9tTGluZSwgMCksIFBvcyh0b0xpbmUgKyAxLCAwKSwgcmVjb2duaXplTWFya2VyKCttYXJrZXJJRCkpO1xuICAgICAgICAgIGlmIChmb3VuZC5sZW5ndGggJiYgKHJhbmdlID0gZm91bmRbMF0uZmluZCgpKSlcbiAgICAgICAgICAgIHRleHQgKz0gZ2V0QmV0d2VlbihjbS5kb2MsIHJhbmdlLmZyb20sIHJhbmdlLnRvKS5qb2luKGxpbmVTZXApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAobm9kZS5nZXRBdHRyaWJ1dGUoXCJjb250ZW50ZWRpdGFibGVcIikgPT0gXCJmYWxzZVwiKSByZXR1cm47XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9kZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgIHdhbGsobm9kZS5jaGlsZE5vZGVzW2ldKTtcbiAgICAgICAgaWYgKC9eKHByZXxkaXZ8cCkkL2kudGVzdChub2RlLm5vZGVOYW1lKSlcbiAgICAgICAgICBjbG9zaW5nID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAobm9kZS5ub2RlVHlwZSA9PSAzKSB7XG4gICAgICAgIHZhciB2YWwgPSBub2RlLm5vZGVWYWx1ZTtcbiAgICAgICAgaWYgKCF2YWwpIHJldHVybjtcbiAgICAgICAgaWYgKGNsb3NpbmcpIHtcbiAgICAgICAgICB0ZXh0ICs9IGxpbmVTZXA7XG4gICAgICAgICAgY2xvc2luZyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHRleHQgKz0gdmFsO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKDs7KSB7XG4gICAgICB3YWxrKGZyb20pO1xuICAgICAgaWYgKGZyb20gPT0gdG8pIGJyZWFrO1xuICAgICAgZnJvbSA9IGZyb20ubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIHJldHVybiB0ZXh0O1xuICB9XG5cbiAgQ29kZU1pcnJvci5pbnB1dFN0eWxlcyA9IHtcInRleHRhcmVhXCI6IFRleHRhcmVhSW5wdXQsIFwiY29udGVudGVkaXRhYmxlXCI6IENvbnRlbnRFZGl0YWJsZUlucHV0fTtcblxuICAvLyBTRUxFQ1RJT04gLyBDVVJTT1JcblxuICAvLyBTZWxlY3Rpb24gb2JqZWN0cyBhcmUgaW1tdXRhYmxlLiBBIG5ldyBvbmUgaXMgY3JlYXRlZCBldmVyeSB0aW1lXG4gIC8vIHRoZSBzZWxlY3Rpb24gY2hhbmdlcy4gQSBzZWxlY3Rpb24gaXMgb25lIG9yIG1vcmUgbm9uLW92ZXJsYXBwaW5nXG4gIC8vIChhbmQgbm9uLXRvdWNoaW5nKSByYW5nZXMsIHNvcnRlZCwgYW5kIGFuIGludGVnZXIgdGhhdCBpbmRpY2F0ZXNcbiAgLy8gd2hpY2ggb25lIGlzIHRoZSBwcmltYXJ5IHNlbGVjdGlvbiAodGhlIG9uZSB0aGF0J3Mgc2Nyb2xsZWQgaW50b1xuICAvLyB2aWV3LCB0aGF0IGdldEN1cnNvciByZXR1cm5zLCBldGMpLlxuICBmdW5jdGlvbiBTZWxlY3Rpb24ocmFuZ2VzLCBwcmltSW5kZXgpIHtcbiAgICB0aGlzLnJhbmdlcyA9IHJhbmdlcztcbiAgICB0aGlzLnByaW1JbmRleCA9IHByaW1JbmRleDtcbiAgfVxuXG4gIFNlbGVjdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgcHJpbWFyeTogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLnJhbmdlc1t0aGlzLnByaW1JbmRleF07IH0sXG4gICAgZXF1YWxzOiBmdW5jdGlvbihvdGhlcikge1xuICAgICAgaWYgKG90aGVyID09IHRoaXMpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKG90aGVyLnByaW1JbmRleCAhPSB0aGlzLnByaW1JbmRleCB8fCBvdGhlci5yYW5nZXMubGVuZ3RoICE9IHRoaXMucmFuZ2VzLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgaGVyZSA9IHRoaXMucmFuZ2VzW2ldLCB0aGVyZSA9IG90aGVyLnJhbmdlc1tpXTtcbiAgICAgICAgaWYgKGNtcChoZXJlLmFuY2hvciwgdGhlcmUuYW5jaG9yKSAhPSAwIHx8IGNtcChoZXJlLmhlYWQsIHRoZXJlLmhlYWQpICE9IDApIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG4gICAgZGVlcENvcHk6IGZ1bmN0aW9uKCkge1xuICAgICAgZm9yICh2YXIgb3V0ID0gW10sIGkgPSAwOyBpIDwgdGhpcy5yYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgICAgIG91dFtpXSA9IG5ldyBSYW5nZShjb3B5UG9zKHRoaXMucmFuZ2VzW2ldLmFuY2hvciksIGNvcHlQb3ModGhpcy5yYW5nZXNbaV0uaGVhZCkpO1xuICAgICAgcmV0dXJuIG5ldyBTZWxlY3Rpb24ob3V0LCB0aGlzLnByaW1JbmRleCk7XG4gICAgfSxcbiAgICBzb21ldGhpbmdTZWxlY3RlZDogZnVuY3Rpb24oKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgICAgICBpZiAoIXRoaXMucmFuZ2VzW2ldLmVtcHR5KCkpIHJldHVybiB0cnVlO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG4gICAgY29udGFpbnM6IGZ1bmN0aW9uKHBvcywgZW5kKSB7XG4gICAgICBpZiAoIWVuZCkgZW5kID0gcG9zO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnJhbmdlc1tpXTtcbiAgICAgICAgaWYgKGNtcChlbmQsIHJhbmdlLmZyb20oKSkgPj0gMCAmJiBjbXAocG9zLCByYW5nZS50bygpKSA8PSAwKVxuICAgICAgICAgIHJldHVybiBpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH1cbiAgfTtcblxuICBmdW5jdGlvbiBSYW5nZShhbmNob3IsIGhlYWQpIHtcbiAgICB0aGlzLmFuY2hvciA9IGFuY2hvcjsgdGhpcy5oZWFkID0gaGVhZDtcbiAgfVxuXG4gIFJhbmdlLnByb3RvdHlwZSA9IHtcbiAgICBmcm9tOiBmdW5jdGlvbigpIHsgcmV0dXJuIG1pblBvcyh0aGlzLmFuY2hvciwgdGhpcy5oZWFkKTsgfSxcbiAgICB0bzogZnVuY3Rpb24oKSB7IHJldHVybiBtYXhQb3ModGhpcy5hbmNob3IsIHRoaXMuaGVhZCk7IH0sXG4gICAgZW1wdHk6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMuaGVhZC5saW5lID09IHRoaXMuYW5jaG9yLmxpbmUgJiYgdGhpcy5oZWFkLmNoID09IHRoaXMuYW5jaG9yLmNoO1xuICAgIH1cbiAgfTtcblxuICAvLyBUYWtlIGFuIHVuc29ydGVkLCBwb3RlbnRpYWxseSBvdmVybGFwcGluZyBzZXQgb2YgcmFuZ2VzLCBhbmRcbiAgLy8gYnVpbGQgYSBzZWxlY3Rpb24gb3V0IG9mIGl0LiAnQ29uc3VtZXMnIHJhbmdlcyBhcnJheSAobW9kaWZ5aW5nXG4gIC8vIGl0KS5cbiAgZnVuY3Rpb24gbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcywgcHJpbUluZGV4KSB7XG4gICAgdmFyIHByaW0gPSByYW5nZXNbcHJpbUluZGV4XTtcbiAgICByYW5nZXMuc29ydChmdW5jdGlvbihhLCBiKSB7IHJldHVybiBjbXAoYS5mcm9tKCksIGIuZnJvbSgpKTsgfSk7XG4gICAgcHJpbUluZGV4ID0gaW5kZXhPZihyYW5nZXMsIHByaW0pO1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgY3VyID0gcmFuZ2VzW2ldLCBwcmV2ID0gcmFuZ2VzW2kgLSAxXTtcbiAgICAgIGlmIChjbXAocHJldi50bygpLCBjdXIuZnJvbSgpKSA+PSAwKSB7XG4gICAgICAgIHZhciBmcm9tID0gbWluUG9zKHByZXYuZnJvbSgpLCBjdXIuZnJvbSgpKSwgdG8gPSBtYXhQb3MocHJldi50bygpLCBjdXIudG8oKSk7XG4gICAgICAgIHZhciBpbnYgPSBwcmV2LmVtcHR5KCkgPyBjdXIuZnJvbSgpID09IGN1ci5oZWFkIDogcHJldi5mcm9tKCkgPT0gcHJldi5oZWFkO1xuICAgICAgICBpZiAoaSA8PSBwcmltSW5kZXgpIC0tcHJpbUluZGV4O1xuICAgICAgICByYW5nZXMuc3BsaWNlKC0taSwgMiwgbmV3IFJhbmdlKGludiA/IHRvIDogZnJvbSwgaW52ID8gZnJvbSA6IHRvKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuZXcgU2VsZWN0aW9uKHJhbmdlcywgcHJpbUluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNpbXBsZVNlbGVjdGlvbihhbmNob3IsIGhlYWQpIHtcbiAgICByZXR1cm4gbmV3IFNlbGVjdGlvbihbbmV3IFJhbmdlKGFuY2hvciwgaGVhZCB8fCBhbmNob3IpXSwgMCk7XG4gIH1cblxuICAvLyBNb3N0IG9mIHRoZSBleHRlcm5hbCBBUEkgY2xpcHMgZ2l2ZW4gcG9zaXRpb25zIHRvIG1ha2Ugc3VyZSB0aGV5XG4gIC8vIGFjdHVhbGx5IGV4aXN0IHdpdGhpbiB0aGUgZG9jdW1lbnQuXG4gIGZ1bmN0aW9uIGNsaXBMaW5lKGRvYywgbikge3JldHVybiBNYXRoLm1heChkb2MuZmlyc3QsIE1hdGgubWluKG4sIGRvYy5maXJzdCArIGRvYy5zaXplIC0gMSkpO31cbiAgZnVuY3Rpb24gY2xpcFBvcyhkb2MsIHBvcykge1xuICAgIGlmIChwb3MubGluZSA8IGRvYy5maXJzdCkgcmV0dXJuIFBvcyhkb2MuZmlyc3QsIDApO1xuICAgIHZhciBsYXN0ID0gZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxO1xuICAgIGlmIChwb3MubGluZSA+IGxhc3QpIHJldHVybiBQb3MobGFzdCwgZ2V0TGluZShkb2MsIGxhc3QpLnRleHQubGVuZ3RoKTtcbiAgICByZXR1cm4gY2xpcFRvTGVuKHBvcywgZ2V0TGluZShkb2MsIHBvcy5saW5lKS50ZXh0Lmxlbmd0aCk7XG4gIH1cbiAgZnVuY3Rpb24gY2xpcFRvTGVuKHBvcywgbGluZWxlbikge1xuICAgIHZhciBjaCA9IHBvcy5jaDtcbiAgICBpZiAoY2ggPT0gbnVsbCB8fCBjaCA+IGxpbmVsZW4pIHJldHVybiBQb3MocG9zLmxpbmUsIGxpbmVsZW4pO1xuICAgIGVsc2UgaWYgKGNoIDwgMCkgcmV0dXJuIFBvcyhwb3MubGluZSwgMCk7XG4gICAgZWxzZSByZXR1cm4gcG9zO1xuICB9XG4gIGZ1bmN0aW9uIGlzTGluZShkb2MsIGwpIHtyZXR1cm4gbCA+PSBkb2MuZmlyc3QgJiYgbCA8IGRvYy5maXJzdCArIGRvYy5zaXplO31cbiAgZnVuY3Rpb24gY2xpcFBvc0FycmF5KGRvYywgYXJyYXkpIHtcbiAgICBmb3IgKHZhciBvdXQgPSBbXSwgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykgb3V0W2ldID0gY2xpcFBvcyhkb2MsIGFycmF5W2ldKTtcbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgLy8gU0VMRUNUSU9OIFVQREFURVNcblxuICAvLyBUaGUgJ3Njcm9sbCcgcGFyYW1ldGVyIGdpdmVuIHRvIG1hbnkgb2YgdGhlc2UgaW5kaWNhdGVkIHdoZXRoZXJcbiAgLy8gdGhlIG5ldyBjdXJzb3IgcG9zaXRpb24gc2hvdWxkIGJlIHNjcm9sbGVkIGludG8gdmlldyBhZnRlclxuICAvLyBtb2RpZnlpbmcgdGhlIHNlbGVjdGlvbi5cblxuICAvLyBJZiBzaGlmdCBpcyBoZWxkIG9yIHRoZSBleHRlbmQgZmxhZyBpcyBzZXQsIGV4dGVuZHMgYSByYW5nZSB0b1xuICAvLyBpbmNsdWRlIGEgZ2l2ZW4gcG9zaXRpb24gKGFuZCBvcHRpb25hbGx5IGEgc2Vjb25kIHBvc2l0aW9uKS5cbiAgLy8gT3RoZXJ3aXNlLCBzaW1wbHkgcmV0dXJucyB0aGUgcmFuZ2UgYmV0d2VlbiB0aGUgZ2l2ZW4gcG9zaXRpb25zLlxuICAvLyBVc2VkIGZvciBjdXJzb3IgbW90aW9uIGFuZCBzdWNoLlxuICBmdW5jdGlvbiBleHRlbmRSYW5nZShkb2MsIHJhbmdlLCBoZWFkLCBvdGhlcikge1xuICAgIGlmIChkb2MuY20gJiYgZG9jLmNtLmRpc3BsYXkuc2hpZnQgfHwgZG9jLmV4dGVuZCkge1xuICAgICAgdmFyIGFuY2hvciA9IHJhbmdlLmFuY2hvcjtcbiAgICAgIGlmIChvdGhlcikge1xuICAgICAgICB2YXIgcG9zQmVmb3JlID0gY21wKGhlYWQsIGFuY2hvcikgPCAwO1xuICAgICAgICBpZiAocG9zQmVmb3JlICE9IChjbXAob3RoZXIsIGFuY2hvcikgPCAwKSkge1xuICAgICAgICAgIGFuY2hvciA9IGhlYWQ7XG4gICAgICAgICAgaGVhZCA9IG90aGVyO1xuICAgICAgICB9IGVsc2UgaWYgKHBvc0JlZm9yZSAhPSAoY21wKGhlYWQsIG90aGVyKSA8IDApKSB7XG4gICAgICAgICAgaGVhZCA9IG90aGVyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV3IFJhbmdlKGFuY2hvciwgaGVhZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBuZXcgUmFuZ2Uob3RoZXIgfHwgaGVhZCwgaGVhZCk7XG4gICAgfVxuICB9XG5cbiAgLy8gRXh0ZW5kIHRoZSBwcmltYXJ5IHNlbGVjdGlvbiByYW5nZSwgZGlzY2FyZCB0aGUgcmVzdC5cbiAgZnVuY3Rpb24gZXh0ZW5kU2VsZWN0aW9uKGRvYywgaGVhZCwgb3RoZXIsIG9wdGlvbnMpIHtcbiAgICBzZXRTZWxlY3Rpb24oZG9jLCBuZXcgU2VsZWN0aW9uKFtleHRlbmRSYW5nZShkb2MsIGRvYy5zZWwucHJpbWFyeSgpLCBoZWFkLCBvdGhlcildLCAwKSwgb3B0aW9ucyk7XG4gIH1cblxuICAvLyBFeHRlbmQgYWxsIHNlbGVjdGlvbnMgKHBvcyBpcyBhbiBhcnJheSBvZiBzZWxlY3Rpb25zIHdpdGggbGVuZ3RoXG4gIC8vIGVxdWFsIHRoZSBudW1iZXIgb2Ygc2VsZWN0aW9ucylcbiAgZnVuY3Rpb24gZXh0ZW5kU2VsZWN0aW9ucyhkb2MsIGhlYWRzLCBvcHRpb25zKSB7XG4gICAgZm9yICh2YXIgb3V0ID0gW10sIGkgPSAwOyBpIDwgZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgICBvdXRbaV0gPSBleHRlbmRSYW5nZShkb2MsIGRvYy5zZWwucmFuZ2VzW2ldLCBoZWFkc1tpXSwgbnVsbCk7XG4gICAgdmFyIG5ld1NlbCA9IG5vcm1hbGl6ZVNlbGVjdGlvbihvdXQsIGRvYy5zZWwucHJpbUluZGV4KTtcbiAgICBzZXRTZWxlY3Rpb24oZG9jLCBuZXdTZWwsIG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gVXBkYXRlcyBhIHNpbmdsZSByYW5nZSBpbiB0aGUgc2VsZWN0aW9uLlxuICBmdW5jdGlvbiByZXBsYWNlT25lU2VsZWN0aW9uKGRvYywgaSwgcmFuZ2UsIG9wdGlvbnMpIHtcbiAgICB2YXIgcmFuZ2VzID0gZG9jLnNlbC5yYW5nZXMuc2xpY2UoMCk7XG4gICAgcmFuZ2VzW2ldID0gcmFuZ2U7XG4gICAgc2V0U2VsZWN0aW9uKGRvYywgbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcywgZG9jLnNlbC5wcmltSW5kZXgpLCBvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJlc2V0IHRoZSBzZWxlY3Rpb24gdG8gYSBzaW5nbGUgcmFuZ2UuXG4gIGZ1bmN0aW9uIHNldFNpbXBsZVNlbGVjdGlvbihkb2MsIGFuY2hvciwgaGVhZCwgb3B0aW9ucykge1xuICAgIHNldFNlbGVjdGlvbihkb2MsIHNpbXBsZVNlbGVjdGlvbihhbmNob3IsIGhlYWQpLCBvcHRpb25zKTtcbiAgfVxuXG4gIC8vIEdpdmUgYmVmb3JlU2VsZWN0aW9uQ2hhbmdlIGhhbmRsZXJzIGEgY2hhbmdlIHRvIGluZmx1ZW5jZSBhXG4gIC8vIHNlbGVjdGlvbiB1cGRhdGUuXG4gIGZ1bmN0aW9uIGZpbHRlclNlbGVjdGlvbkNoYW5nZShkb2MsIHNlbCkge1xuICAgIHZhciBvYmogPSB7XG4gICAgICByYW5nZXM6IHNlbC5yYW5nZXMsXG4gICAgICB1cGRhdGU6IGZ1bmN0aW9uKHJhbmdlcykge1xuICAgICAgICB0aGlzLnJhbmdlcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICAgICAgICB0aGlzLnJhbmdlc1tpXSA9IG5ldyBSYW5nZShjbGlwUG9zKGRvYywgcmFuZ2VzW2ldLmFuY2hvciksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xpcFBvcyhkb2MsIHJhbmdlc1tpXS5oZWFkKSk7XG4gICAgICB9XG4gICAgfTtcbiAgICBzaWduYWwoZG9jLCBcImJlZm9yZVNlbGVjdGlvbkNoYW5nZVwiLCBkb2MsIG9iaik7XG4gICAgaWYgKGRvYy5jbSkgc2lnbmFsKGRvYy5jbSwgXCJiZWZvcmVTZWxlY3Rpb25DaGFuZ2VcIiwgZG9jLmNtLCBvYmopO1xuICAgIGlmIChvYmoucmFuZ2VzICE9IHNlbC5yYW5nZXMpIHJldHVybiBub3JtYWxpemVTZWxlY3Rpb24ob2JqLnJhbmdlcywgb2JqLnJhbmdlcy5sZW5ndGggLSAxKTtcbiAgICBlbHNlIHJldHVybiBzZWw7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTZWxlY3Rpb25SZXBsYWNlSGlzdG9yeShkb2MsIHNlbCwgb3B0aW9ucykge1xuICAgIHZhciBkb25lID0gZG9jLmhpc3RvcnkuZG9uZSwgbGFzdCA9IGxzdChkb25lKTtcbiAgICBpZiAobGFzdCAmJiBsYXN0LnJhbmdlcykge1xuICAgICAgZG9uZVtkb25lLmxlbmd0aCAtIDFdID0gc2VsO1xuICAgICAgc2V0U2VsZWN0aW9uTm9VbmRvKGRvYywgc2VsLCBvcHRpb25zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0U2VsZWN0aW9uKGRvYywgc2VsLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICAvLyBTZXQgYSBuZXcgc2VsZWN0aW9uLlxuICBmdW5jdGlvbiBzZXRTZWxlY3Rpb24oZG9jLCBzZWwsIG9wdGlvbnMpIHtcbiAgICBzZXRTZWxlY3Rpb25Ob1VuZG8oZG9jLCBzZWwsIG9wdGlvbnMpO1xuICAgIGFkZFNlbGVjdGlvblRvSGlzdG9yeShkb2MsIGRvYy5zZWwsIGRvYy5jbSA/IGRvYy5jbS5jdXJPcC5pZCA6IE5hTiwgb3B0aW9ucyk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTZWxlY3Rpb25Ob1VuZG8oZG9jLCBzZWwsIG9wdGlvbnMpIHtcbiAgICBpZiAoaGFzSGFuZGxlcihkb2MsIFwiYmVmb3JlU2VsZWN0aW9uQ2hhbmdlXCIpIHx8IGRvYy5jbSAmJiBoYXNIYW5kbGVyKGRvYy5jbSwgXCJiZWZvcmVTZWxlY3Rpb25DaGFuZ2VcIikpXG4gICAgICBzZWwgPSBmaWx0ZXJTZWxlY3Rpb25DaGFuZ2UoZG9jLCBzZWwpO1xuXG4gICAgdmFyIGJpYXMgPSBvcHRpb25zICYmIG9wdGlvbnMuYmlhcyB8fFxuICAgICAgKGNtcChzZWwucHJpbWFyeSgpLmhlYWQsIGRvYy5zZWwucHJpbWFyeSgpLmhlYWQpIDwgMCA/IC0xIDogMSk7XG4gICAgc2V0U2VsZWN0aW9uSW5uZXIoZG9jLCBza2lwQXRvbWljSW5TZWxlY3Rpb24oZG9jLCBzZWwsIGJpYXMsIHRydWUpKTtcblxuICAgIGlmICghKG9wdGlvbnMgJiYgb3B0aW9ucy5zY3JvbGwgPT09IGZhbHNlKSAmJiBkb2MuY20pXG4gICAgICBlbnN1cmVDdXJzb3JWaXNpYmxlKGRvYy5jbSk7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRTZWxlY3Rpb25Jbm5lcihkb2MsIHNlbCkge1xuICAgIGlmIChzZWwuZXF1YWxzKGRvYy5zZWwpKSByZXR1cm47XG5cbiAgICBkb2Muc2VsID0gc2VsO1xuXG4gICAgaWYgKGRvYy5jbSkge1xuICAgICAgZG9jLmNtLmN1ck9wLnVwZGF0ZUlucHV0ID0gZG9jLmNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgc2lnbmFsQ3Vyc29yQWN0aXZpdHkoZG9jLmNtKTtcbiAgICB9XG4gICAgc2lnbmFsTGF0ZXIoZG9jLCBcImN1cnNvckFjdGl2aXR5XCIsIGRvYyk7XG4gIH1cblxuICAvLyBWZXJpZnkgdGhhdCB0aGUgc2VsZWN0aW9uIGRvZXMgbm90IHBhcnRpYWxseSBzZWxlY3QgYW55IGF0b21pY1xuICAvLyBtYXJrZWQgcmFuZ2VzLlxuICBmdW5jdGlvbiByZUNoZWNrU2VsZWN0aW9uKGRvYykge1xuICAgIHNldFNlbGVjdGlvbklubmVyKGRvYywgc2tpcEF0b21pY0luU2VsZWN0aW9uKGRvYywgZG9jLnNlbCwgbnVsbCwgZmFsc2UpLCBzZWxfZG9udFNjcm9sbCk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBzZWxlY3Rpb24gdGhhdCBkb2VzIG5vdCBwYXJ0aWFsbHkgc2VsZWN0IGFueSBhdG9taWNcbiAgLy8gcmFuZ2VzLlxuICBmdW5jdGlvbiBza2lwQXRvbWljSW5TZWxlY3Rpb24oZG9jLCBzZWwsIGJpYXMsIG1heUNsZWFyKSB7XG4gICAgdmFyIG91dDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciByYW5nZSA9IHNlbC5yYW5nZXNbaV07XG4gICAgICB2YXIgbmV3QW5jaG9yID0gc2tpcEF0b21pYyhkb2MsIHJhbmdlLmFuY2hvciwgYmlhcywgbWF5Q2xlYXIpO1xuICAgICAgdmFyIG5ld0hlYWQgPSBza2lwQXRvbWljKGRvYywgcmFuZ2UuaGVhZCwgYmlhcywgbWF5Q2xlYXIpO1xuICAgICAgaWYgKG91dCB8fCBuZXdBbmNob3IgIT0gcmFuZ2UuYW5jaG9yIHx8IG5ld0hlYWQgIT0gcmFuZ2UuaGVhZCkge1xuICAgICAgICBpZiAoIW91dCkgb3V0ID0gc2VsLnJhbmdlcy5zbGljZSgwLCBpKTtcbiAgICAgICAgb3V0W2ldID0gbmV3IFJhbmdlKG5ld0FuY2hvciwgbmV3SGVhZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXQgPyBub3JtYWxpemVTZWxlY3Rpb24ob3V0LCBzZWwucHJpbUluZGV4KSA6IHNlbDtcbiAgfVxuXG4gIC8vIEVuc3VyZSBhIGdpdmVuIHBvc2l0aW9uIGlzIG5vdCBpbnNpZGUgYW4gYXRvbWljIHJhbmdlLlxuICBmdW5jdGlvbiBza2lwQXRvbWljKGRvYywgcG9zLCBiaWFzLCBtYXlDbGVhcikge1xuICAgIHZhciBmbGlwcGVkID0gZmFsc2UsIGN1clBvcyA9IHBvcztcbiAgICB2YXIgZGlyID0gYmlhcyB8fCAxO1xuICAgIGRvYy5jYW50RWRpdCA9IGZhbHNlO1xuICAgIHNlYXJjaDogZm9yICg7Oykge1xuICAgICAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgY3VyUG9zLmxpbmUpO1xuICAgICAgaWYgKGxpbmUubWFya2VkU3BhbnMpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lLm1hcmtlZFNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgdmFyIHNwID0gbGluZS5tYXJrZWRTcGFuc1tpXSwgbSA9IHNwLm1hcmtlcjtcbiAgICAgICAgICBpZiAoKHNwLmZyb20gPT0gbnVsbCB8fCAobS5pbmNsdXNpdmVMZWZ0ID8gc3AuZnJvbSA8PSBjdXJQb3MuY2ggOiBzcC5mcm9tIDwgY3VyUG9zLmNoKSkgJiZcbiAgICAgICAgICAgICAgKHNwLnRvID09IG51bGwgfHwgKG0uaW5jbHVzaXZlUmlnaHQgPyBzcC50byA+PSBjdXJQb3MuY2ggOiBzcC50byA+IGN1clBvcy5jaCkpKSB7XG4gICAgICAgICAgICBpZiAobWF5Q2xlYXIpIHtcbiAgICAgICAgICAgICAgc2lnbmFsKG0sIFwiYmVmb3JlQ3Vyc29yRW50ZXJcIik7XG4gICAgICAgICAgICAgIGlmIChtLmV4cGxpY2l0bHlDbGVhcmVkKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFsaW5lLm1hcmtlZFNwYW5zKSBicmVhaztcbiAgICAgICAgICAgICAgICBlbHNlIHstLWk7IGNvbnRpbnVlO31cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFtLmF0b21pYykgY29udGludWU7XG4gICAgICAgICAgICB2YXIgbmV3UG9zID0gbS5maW5kKGRpciA8IDAgPyAtMSA6IDEpO1xuICAgICAgICAgICAgaWYgKGNtcChuZXdQb3MsIGN1clBvcykgPT0gMCkge1xuICAgICAgICAgICAgICBuZXdQb3MuY2ggKz0gZGlyO1xuICAgICAgICAgICAgICBpZiAobmV3UG9zLmNoIDwgMCkge1xuICAgICAgICAgICAgICAgIGlmIChuZXdQb3MubGluZSA+IGRvYy5maXJzdCkgbmV3UG9zID0gY2xpcFBvcyhkb2MsIFBvcyhuZXdQb3MubGluZSAtIDEpKTtcbiAgICAgICAgICAgICAgICBlbHNlIG5ld1BvcyA9IG51bGw7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAobmV3UG9zLmNoID4gbGluZS50ZXh0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGlmIChuZXdQb3MubGluZSA8IGRvYy5maXJzdCArIGRvYy5zaXplIC0gMSkgbmV3UG9zID0gUG9zKG5ld1Bvcy5saW5lICsgMSwgMCk7XG4gICAgICAgICAgICAgICAgZWxzZSBuZXdQb3MgPSBudWxsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmICghbmV3UG9zKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZsaXBwZWQpIHtcbiAgICAgICAgICAgICAgICAgIC8vIERyaXZlbiBpbiBhIGNvcm5lciAtLSBubyB2YWxpZCBjdXJzb3IgcG9zaXRpb24gZm91bmQgYXQgYWxsXG4gICAgICAgICAgICAgICAgICAvLyAtLSB0cnkgYWdhaW4gKndpdGgqIGNsZWFyaW5nLCBpZiB3ZSBkaWRuJ3QgYWxyZWFkeVxuICAgICAgICAgICAgICAgICAgaWYgKCFtYXlDbGVhcikgcmV0dXJuIHNraXBBdG9taWMoZG9jLCBwb3MsIGJpYXMsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgLy8gT3RoZXJ3aXNlLCB0dXJuIG9mZiBlZGl0aW5nIHVudGlsIGZ1cnRoZXIgbm90aWNlLCBhbmQgcmV0dXJuIHRoZSBzdGFydCBvZiB0aGUgZG9jXG4gICAgICAgICAgICAgICAgICBkb2MuY2FudEVkaXQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFBvcyhkb2MuZmlyc3QsIDApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmbGlwcGVkID0gdHJ1ZTsgbmV3UG9zID0gcG9zOyBkaXIgPSAtZGlyO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjdXJQb3MgPSBuZXdQb3M7XG4gICAgICAgICAgICBjb250aW51ZSBzZWFyY2g7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VyUG9zO1xuICAgIH1cbiAgfVxuXG4gIC8vIFNFTEVDVElPTiBEUkFXSU5HXG5cbiAgZnVuY3Rpb24gdXBkYXRlU2VsZWN0aW9uKGNtKSB7XG4gICAgY20uZGlzcGxheS5pbnB1dC5zaG93U2VsZWN0aW9uKGNtLmRpc3BsYXkuaW5wdXQucHJlcGFyZVNlbGVjdGlvbigpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXBhcmVTZWxlY3Rpb24oY20sIHByaW1hcnkpIHtcbiAgICB2YXIgZG9jID0gY20uZG9jLCByZXN1bHQgPSB7fTtcbiAgICB2YXIgY3VyRnJhZ21lbnQgPSByZXN1bHQuY3Vyc29ycyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgICB2YXIgc2VsRnJhZ21lbnQgPSByZXN1bHQuc2VsZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHByaW1hcnkgPT09IGZhbHNlICYmIGkgPT0gZG9jLnNlbC5wcmltSW5kZXgpIGNvbnRpbnVlO1xuICAgICAgdmFyIHJhbmdlID0gZG9jLnNlbC5yYW5nZXNbaV07XG4gICAgICB2YXIgY29sbGFwc2VkID0gcmFuZ2UuZW1wdHkoKTtcbiAgICAgIGlmIChjb2xsYXBzZWQgfHwgY20ub3B0aW9ucy5zaG93Q3Vyc29yV2hlblNlbGVjdGluZylcbiAgICAgICAgZHJhd1NlbGVjdGlvbkN1cnNvcihjbSwgcmFuZ2UuaGVhZCwgY3VyRnJhZ21lbnQpO1xuICAgICAgaWYgKCFjb2xsYXBzZWQpXG4gICAgICAgIGRyYXdTZWxlY3Rpb25SYW5nZShjbSwgcmFuZ2UsIHNlbEZyYWdtZW50KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIERyYXdzIGEgY3Vyc29yIGZvciB0aGUgZ2l2ZW4gcmFuZ2VcbiAgZnVuY3Rpb24gZHJhd1NlbGVjdGlvbkN1cnNvcihjbSwgaGVhZCwgb3V0cHV0KSB7XG4gICAgdmFyIHBvcyA9IGN1cnNvckNvb3JkcyhjbSwgaGVhZCwgXCJkaXZcIiwgbnVsbCwgbnVsbCwgIWNtLm9wdGlvbnMuc2luZ2xlQ3Vyc29ySGVpZ2h0UGVyTGluZSk7XG5cbiAgICB2YXIgY3Vyc29yID0gb3V0cHV0LmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBcIlxcdTAwYTBcIiwgXCJDb2RlTWlycm9yLWN1cnNvclwiKSk7XG4gICAgY3Vyc29yLnN0eWxlLmxlZnQgPSBwb3MubGVmdCArIFwicHhcIjtcbiAgICBjdXJzb3Iuc3R5bGUudG9wID0gcG9zLnRvcCArIFwicHhcIjtcbiAgICBjdXJzb3Iuc3R5bGUuaGVpZ2h0ID0gTWF0aC5tYXgoMCwgcG9zLmJvdHRvbSAtIHBvcy50b3ApICogY20ub3B0aW9ucy5jdXJzb3JIZWlnaHQgKyBcInB4XCI7XG5cbiAgICBpZiAocG9zLm90aGVyKSB7XG4gICAgICAvLyBTZWNvbmRhcnkgY3Vyc29yLCBzaG93biB3aGVuIG9uIGEgJ2p1bXAnIGluIGJpLWRpcmVjdGlvbmFsIHRleHRcbiAgICAgIHZhciBvdGhlckN1cnNvciA9IG91dHB1dC5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgXCJcXHUwMGEwXCIsIFwiQ29kZU1pcnJvci1jdXJzb3IgQ29kZU1pcnJvci1zZWNvbmRhcnljdXJzb3JcIikpO1xuICAgICAgb3RoZXJDdXJzb3Iuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgICBvdGhlckN1cnNvci5zdHlsZS5sZWZ0ID0gcG9zLm90aGVyLmxlZnQgKyBcInB4XCI7XG4gICAgICBvdGhlckN1cnNvci5zdHlsZS50b3AgPSBwb3Mub3RoZXIudG9wICsgXCJweFwiO1xuICAgICAgb3RoZXJDdXJzb3Iuc3R5bGUuaGVpZ2h0ID0gKHBvcy5vdGhlci5ib3R0b20gLSBwb3Mub3RoZXIudG9wKSAqIC44NSArIFwicHhcIjtcbiAgICB9XG4gIH1cblxuICAvLyBEcmF3cyB0aGUgZ2l2ZW4gcmFuZ2UgYXMgYSBoaWdobGlnaHRlZCBzZWxlY3Rpb25cbiAgZnVuY3Rpb24gZHJhd1NlbGVjdGlvblJhbmdlKGNtLCByYW5nZSwgb3V0cHV0KSB7XG4gICAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gICAgdmFyIGZyYWdtZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgIHZhciBwYWRkaW5nID0gcGFkZGluZ0goY20uZGlzcGxheSksIGxlZnRTaWRlID0gcGFkZGluZy5sZWZ0O1xuICAgIHZhciByaWdodFNpZGUgPSBNYXRoLm1heChkaXNwbGF5LnNpemVyV2lkdGgsIGRpc3BsYXlXaWR0aChjbSkgLSBkaXNwbGF5LnNpemVyLm9mZnNldExlZnQpIC0gcGFkZGluZy5yaWdodDtcblxuICAgIGZ1bmN0aW9uIGFkZChsZWZ0LCB0b3AsIHdpZHRoLCBib3R0b20pIHtcbiAgICAgIGlmICh0b3AgPCAwKSB0b3AgPSAwO1xuICAgICAgdG9wID0gTWF0aC5yb3VuZCh0b3ApO1xuICAgICAgYm90dG9tID0gTWF0aC5yb3VuZChib3R0b20pO1xuICAgICAgZnJhZ21lbnQuYXBwZW5kQ2hpbGQoZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1zZWxlY3RlZFwiLCBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogXCIgKyBsZWZ0ICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInB4OyB0b3A6IFwiICsgdG9wICsgXCJweDsgd2lkdGg6IFwiICsgKHdpZHRoID09IG51bGwgPyByaWdodFNpZGUgLSBsZWZ0IDogd2lkdGgpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInB4OyBoZWlnaHQ6IFwiICsgKGJvdHRvbSAtIHRvcCkgKyBcInB4XCIpKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkcmF3Rm9yTGluZShsaW5lLCBmcm9tQXJnLCB0b0FyZykge1xuICAgICAgdmFyIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgbGluZSk7XG4gICAgICB2YXIgbGluZUxlbiA9IGxpbmVPYmoudGV4dC5sZW5ndGg7XG4gICAgICB2YXIgc3RhcnQsIGVuZDtcbiAgICAgIGZ1bmN0aW9uIGNvb3JkcyhjaCwgYmlhcykge1xuICAgICAgICByZXR1cm4gY2hhckNvb3JkcyhjbSwgUG9zKGxpbmUsIGNoKSwgXCJkaXZcIiwgbGluZU9iaiwgYmlhcyk7XG4gICAgICB9XG5cbiAgICAgIGl0ZXJhdGVCaWRpU2VjdGlvbnMoZ2V0T3JkZXIobGluZU9iaiksIGZyb21BcmcgfHwgMCwgdG9BcmcgPT0gbnVsbCA/IGxpbmVMZW4gOiB0b0FyZywgZnVuY3Rpb24oZnJvbSwgdG8sIGRpcikge1xuICAgICAgICB2YXIgbGVmdFBvcyA9IGNvb3Jkcyhmcm9tLCBcImxlZnRcIiksIHJpZ2h0UG9zLCBsZWZ0LCByaWdodDtcbiAgICAgICAgaWYgKGZyb20gPT0gdG8pIHtcbiAgICAgICAgICByaWdodFBvcyA9IGxlZnRQb3M7XG4gICAgICAgICAgbGVmdCA9IHJpZ2h0ID0gbGVmdFBvcy5sZWZ0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJpZ2h0UG9zID0gY29vcmRzKHRvIC0gMSwgXCJyaWdodFwiKTtcbiAgICAgICAgICBpZiAoZGlyID09IFwicnRsXCIpIHsgdmFyIHRtcCA9IGxlZnRQb3M7IGxlZnRQb3MgPSByaWdodFBvczsgcmlnaHRQb3MgPSB0bXA7IH1cbiAgICAgICAgICBsZWZ0ID0gbGVmdFBvcy5sZWZ0O1xuICAgICAgICAgIHJpZ2h0ID0gcmlnaHRQb3MucmlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZyb21BcmcgPT0gbnVsbCAmJiBmcm9tID09IDApIGxlZnQgPSBsZWZ0U2lkZTtcbiAgICAgICAgaWYgKHJpZ2h0UG9zLnRvcCAtIGxlZnRQb3MudG9wID4gMykgeyAvLyBEaWZmZXJlbnQgbGluZXMsIGRyYXcgdG9wIHBhcnRcbiAgICAgICAgICBhZGQobGVmdCwgbGVmdFBvcy50b3AsIG51bGwsIGxlZnRQb3MuYm90dG9tKTtcbiAgICAgICAgICBsZWZ0ID0gbGVmdFNpZGU7XG4gICAgICAgICAgaWYgKGxlZnRQb3MuYm90dG9tIDwgcmlnaHRQb3MudG9wKSBhZGQobGVmdCwgbGVmdFBvcy5ib3R0b20sIG51bGwsIHJpZ2h0UG9zLnRvcCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRvQXJnID09IG51bGwgJiYgdG8gPT0gbGluZUxlbikgcmlnaHQgPSByaWdodFNpZGU7XG4gICAgICAgIGlmICghc3RhcnQgfHwgbGVmdFBvcy50b3AgPCBzdGFydC50b3AgfHwgbGVmdFBvcy50b3AgPT0gc3RhcnQudG9wICYmIGxlZnRQb3MubGVmdCA8IHN0YXJ0LmxlZnQpXG4gICAgICAgICAgc3RhcnQgPSBsZWZ0UG9zO1xuICAgICAgICBpZiAoIWVuZCB8fCByaWdodFBvcy5ib3R0b20gPiBlbmQuYm90dG9tIHx8IHJpZ2h0UG9zLmJvdHRvbSA9PSBlbmQuYm90dG9tICYmIHJpZ2h0UG9zLnJpZ2h0ID4gZW5kLnJpZ2h0KVxuICAgICAgICAgIGVuZCA9IHJpZ2h0UG9zO1xuICAgICAgICBpZiAobGVmdCA8IGxlZnRTaWRlICsgMSkgbGVmdCA9IGxlZnRTaWRlO1xuICAgICAgICBhZGQobGVmdCwgcmlnaHRQb3MudG9wLCByaWdodCAtIGxlZnQsIHJpZ2h0UG9zLmJvdHRvbSk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7c3RhcnQ6IHN0YXJ0LCBlbmQ6IGVuZH07XG4gICAgfVxuXG4gICAgdmFyIHNGcm9tID0gcmFuZ2UuZnJvbSgpLCBzVG8gPSByYW5nZS50bygpO1xuICAgIGlmIChzRnJvbS5saW5lID09IHNUby5saW5lKSB7XG4gICAgICBkcmF3Rm9yTGluZShzRnJvbS5saW5lLCBzRnJvbS5jaCwgc1RvLmNoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGZyb21MaW5lID0gZ2V0TGluZShkb2MsIHNGcm9tLmxpbmUpLCB0b0xpbmUgPSBnZXRMaW5lKGRvYywgc1RvLmxpbmUpO1xuICAgICAgdmFyIHNpbmdsZVZMaW5lID0gdmlzdWFsTGluZShmcm9tTGluZSkgPT0gdmlzdWFsTGluZSh0b0xpbmUpO1xuICAgICAgdmFyIGxlZnRFbmQgPSBkcmF3Rm9yTGluZShzRnJvbS5saW5lLCBzRnJvbS5jaCwgc2luZ2xlVkxpbmUgPyBmcm9tTGluZS50ZXh0Lmxlbmd0aCArIDEgOiBudWxsKS5lbmQ7XG4gICAgICB2YXIgcmlnaHRTdGFydCA9IGRyYXdGb3JMaW5lKHNUby5saW5lLCBzaW5nbGVWTGluZSA/IDAgOiBudWxsLCBzVG8uY2gpLnN0YXJ0O1xuICAgICAgaWYgKHNpbmdsZVZMaW5lKSB7XG4gICAgICAgIGlmIChsZWZ0RW5kLnRvcCA8IHJpZ2h0U3RhcnQudG9wIC0gMikge1xuICAgICAgICAgIGFkZChsZWZ0RW5kLnJpZ2h0LCBsZWZ0RW5kLnRvcCwgbnVsbCwgbGVmdEVuZC5ib3R0b20pO1xuICAgICAgICAgIGFkZChsZWZ0U2lkZSwgcmlnaHRTdGFydC50b3AsIHJpZ2h0U3RhcnQubGVmdCwgcmlnaHRTdGFydC5ib3R0b20pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGFkZChsZWZ0RW5kLnJpZ2h0LCBsZWZ0RW5kLnRvcCwgcmlnaHRTdGFydC5sZWZ0IC0gbGVmdEVuZC5yaWdodCwgbGVmdEVuZC5ib3R0b20pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAobGVmdEVuZC5ib3R0b20gPCByaWdodFN0YXJ0LnRvcClcbiAgICAgICAgYWRkKGxlZnRTaWRlLCBsZWZ0RW5kLmJvdHRvbSwgbnVsbCwgcmlnaHRTdGFydC50b3ApO1xuICAgIH1cblxuICAgIG91dHB1dC5hcHBlbmRDaGlsZChmcmFnbWVudCk7XG4gIH1cblxuICAvLyBDdXJzb3ItYmxpbmtpbmdcbiAgZnVuY3Rpb24gcmVzdGFydEJsaW5rKGNtKSB7XG4gICAgaWYgKCFjbS5zdGF0ZS5mb2N1c2VkKSByZXR1cm47XG4gICAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICAgIGNsZWFySW50ZXJ2YWwoZGlzcGxheS5ibGlua2VyKTtcbiAgICB2YXIgb24gPSB0cnVlO1xuICAgIGRpc3BsYXkuY3Vyc29yRGl2LnN0eWxlLnZpc2liaWxpdHkgPSBcIlwiO1xuICAgIGlmIChjbS5vcHRpb25zLmN1cnNvckJsaW5rUmF0ZSA+IDApXG4gICAgICBkaXNwbGF5LmJsaW5rZXIgPSBzZXRJbnRlcnZhbChmdW5jdGlvbigpIHtcbiAgICAgICAgZGlzcGxheS5jdXJzb3JEaXYuc3R5bGUudmlzaWJpbGl0eSA9IChvbiA9ICFvbikgPyBcIlwiIDogXCJoaWRkZW5cIjtcbiAgICAgIH0sIGNtLm9wdGlvbnMuY3Vyc29yQmxpbmtSYXRlKTtcbiAgICBlbHNlIGlmIChjbS5vcHRpb25zLmN1cnNvckJsaW5rUmF0ZSA8IDApXG4gICAgICBkaXNwbGF5LmN1cnNvckRpdi5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjtcbiAgfVxuXG4gIC8vIEhJR0hMSUdIVCBXT1JLRVJcblxuICBmdW5jdGlvbiBzdGFydFdvcmtlcihjbSwgdGltZSkge1xuICAgIGlmIChjbS5kb2MubW9kZS5zdGFydFN0YXRlICYmIGNtLmRvYy5mcm9udGllciA8IGNtLmRpc3BsYXkudmlld1RvKVxuICAgICAgY20uc3RhdGUuaGlnaGxpZ2h0LnNldCh0aW1lLCBiaW5kKGhpZ2hsaWdodFdvcmtlciwgY20pKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhpZ2hsaWdodFdvcmtlcihjbSkge1xuICAgIHZhciBkb2MgPSBjbS5kb2M7XG4gICAgaWYgKGRvYy5mcm9udGllciA8IGRvYy5maXJzdCkgZG9jLmZyb250aWVyID0gZG9jLmZpcnN0O1xuICAgIGlmIChkb2MuZnJvbnRpZXIgPj0gY20uZGlzcGxheS52aWV3VG8pIHJldHVybjtcbiAgICB2YXIgZW5kID0gK25ldyBEYXRlICsgY20ub3B0aW9ucy53b3JrVGltZTtcbiAgICB2YXIgc3RhdGUgPSBjb3B5U3RhdGUoZG9jLm1vZGUsIGdldFN0YXRlQmVmb3JlKGNtLCBkb2MuZnJvbnRpZXIpKTtcbiAgICB2YXIgY2hhbmdlZExpbmVzID0gW107XG5cbiAgICBkb2MuaXRlcihkb2MuZnJvbnRpZXIsIE1hdGgubWluKGRvYy5maXJzdCArIGRvYy5zaXplLCBjbS5kaXNwbGF5LnZpZXdUbyArIDUwMCksIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIGlmIChkb2MuZnJvbnRpZXIgPj0gY20uZGlzcGxheS52aWV3RnJvbSkgeyAvLyBWaXNpYmxlXG4gICAgICAgIHZhciBvbGRTdHlsZXMgPSBsaW5lLnN0eWxlcywgdG9vTG9uZyA9IGxpbmUudGV4dC5sZW5ndGggPiBjbS5vcHRpb25zLm1heEhpZ2hsaWdodExlbmd0aDtcbiAgICAgICAgdmFyIGhpZ2hsaWdodGVkID0gaGlnaGxpZ2h0TGluZShjbSwgbGluZSwgdG9vTG9uZyA/IGNvcHlTdGF0ZShkb2MubW9kZSwgc3RhdGUpIDogc3RhdGUsIHRydWUpO1xuICAgICAgICBsaW5lLnN0eWxlcyA9IGhpZ2hsaWdodGVkLnN0eWxlcztcbiAgICAgICAgdmFyIG9sZENscyA9IGxpbmUuc3R5bGVDbGFzc2VzLCBuZXdDbHMgPSBoaWdobGlnaHRlZC5jbGFzc2VzO1xuICAgICAgICBpZiAobmV3Q2xzKSBsaW5lLnN0eWxlQ2xhc3NlcyA9IG5ld0NscztcbiAgICAgICAgZWxzZSBpZiAob2xkQ2xzKSBsaW5lLnN0eWxlQ2xhc3NlcyA9IG51bGw7XG4gICAgICAgIHZhciBpc2NoYW5nZSA9ICFvbGRTdHlsZXMgfHwgb2xkU3R5bGVzLmxlbmd0aCAhPSBsaW5lLnN0eWxlcy5sZW5ndGggfHxcbiAgICAgICAgICBvbGRDbHMgIT0gbmV3Q2xzICYmICghb2xkQ2xzIHx8ICFuZXdDbHMgfHwgb2xkQ2xzLmJnQ2xhc3MgIT0gbmV3Q2xzLmJnQ2xhc3MgfHwgb2xkQ2xzLnRleHRDbGFzcyAhPSBuZXdDbHMudGV4dENsYXNzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7ICFpc2NoYW5nZSAmJiBpIDwgb2xkU3R5bGVzLmxlbmd0aDsgKytpKSBpc2NoYW5nZSA9IG9sZFN0eWxlc1tpXSAhPSBsaW5lLnN0eWxlc1tpXTtcbiAgICAgICAgaWYgKGlzY2hhbmdlKSBjaGFuZ2VkTGluZXMucHVzaChkb2MuZnJvbnRpZXIpO1xuICAgICAgICBsaW5lLnN0YXRlQWZ0ZXIgPSB0b29Mb25nID8gc3RhdGUgOiBjb3B5U3RhdGUoZG9jLm1vZGUsIHN0YXRlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChsaW5lLnRleHQubGVuZ3RoIDw9IGNtLm9wdGlvbnMubWF4SGlnaGxpZ2h0TGVuZ3RoKVxuICAgICAgICAgIHByb2Nlc3NMaW5lKGNtLCBsaW5lLnRleHQsIHN0YXRlKTtcbiAgICAgICAgbGluZS5zdGF0ZUFmdGVyID0gZG9jLmZyb250aWVyICUgNSA9PSAwID8gY29weVN0YXRlKGRvYy5tb2RlLCBzdGF0ZSkgOiBudWxsO1xuICAgICAgfVxuICAgICAgKytkb2MuZnJvbnRpZXI7XG4gICAgICBpZiAoK25ldyBEYXRlID4gZW5kKSB7XG4gICAgICAgIHN0YXJ0V29ya2VyKGNtLCBjbS5vcHRpb25zLndvcmtEZWxheSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmIChjaGFuZ2VkTGluZXMubGVuZ3RoKSBydW5Jbk9wKGNtLCBmdW5jdGlvbigpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhbmdlZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgICByZWdMaW5lQ2hhbmdlKGNtLCBjaGFuZ2VkTGluZXNbaV0sIFwidGV4dFwiKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEZpbmRzIHRoZSBsaW5lIHRvIHN0YXJ0IHdpdGggd2hlbiBzdGFydGluZyBhIHBhcnNlLiBUcmllcyB0b1xuICAvLyBmaW5kIGEgbGluZSB3aXRoIGEgc3RhdGVBZnRlciwgc28gdGhhdCBpdCBjYW4gc3RhcnQgd2l0aCBhXG4gIC8vIHZhbGlkIHN0YXRlLiBJZiB0aGF0IGZhaWxzLCBpdCByZXR1cm5zIHRoZSBsaW5lIHdpdGggdGhlXG4gIC8vIHNtYWxsZXN0IGluZGVudGF0aW9uLCB3aGljaCB0ZW5kcyB0byBuZWVkIHRoZSBsZWFzdCBjb250ZXh0IHRvXG4gIC8vIHBhcnNlIGNvcnJlY3RseS5cbiAgZnVuY3Rpb24gZmluZFN0YXJ0TGluZShjbSwgbiwgcHJlY2lzZSkge1xuICAgIHZhciBtaW5pbmRlbnQsIG1pbmxpbmUsIGRvYyA9IGNtLmRvYztcbiAgICB2YXIgbGltID0gcHJlY2lzZSA/IC0xIDogbiAtIChjbS5kb2MubW9kZS5pbm5lck1vZGUgPyAxMDAwIDogMTAwKTtcbiAgICBmb3IgKHZhciBzZWFyY2ggPSBuOyBzZWFyY2ggPiBsaW07IC0tc2VhcmNoKSB7XG4gICAgICBpZiAoc2VhcmNoIDw9IGRvYy5maXJzdCkgcmV0dXJuIGRvYy5maXJzdDtcbiAgICAgIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIHNlYXJjaCAtIDEpO1xuICAgICAgaWYgKGxpbmUuc3RhdGVBZnRlciAmJiAoIXByZWNpc2UgfHwgc2VhcmNoIDw9IGRvYy5mcm9udGllcikpIHJldHVybiBzZWFyY2g7XG4gICAgICB2YXIgaW5kZW50ZWQgPSBjb3VudENvbHVtbihsaW5lLnRleHQsIG51bGwsIGNtLm9wdGlvbnMudGFiU2l6ZSk7XG4gICAgICBpZiAobWlubGluZSA9PSBudWxsIHx8IG1pbmluZGVudCA+IGluZGVudGVkKSB7XG4gICAgICAgIG1pbmxpbmUgPSBzZWFyY2ggLSAxO1xuICAgICAgICBtaW5pbmRlbnQgPSBpbmRlbnRlZDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1pbmxpbmU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRTdGF0ZUJlZm9yZShjbSwgbiwgcHJlY2lzZSkge1xuICAgIHZhciBkb2MgPSBjbS5kb2MsIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICAgIGlmICghZG9jLm1vZGUuc3RhcnRTdGF0ZSkgcmV0dXJuIHRydWU7XG4gICAgdmFyIHBvcyA9IGZpbmRTdGFydExpbmUoY20sIG4sIHByZWNpc2UpLCBzdGF0ZSA9IHBvcyA+IGRvYy5maXJzdCAmJiBnZXRMaW5lKGRvYywgcG9zLTEpLnN0YXRlQWZ0ZXI7XG4gICAgaWYgKCFzdGF0ZSkgc3RhdGUgPSBzdGFydFN0YXRlKGRvYy5tb2RlKTtcbiAgICBlbHNlIHN0YXRlID0gY29weVN0YXRlKGRvYy5tb2RlLCBzdGF0ZSk7XG4gICAgZG9jLml0ZXIocG9zLCBuLCBmdW5jdGlvbihsaW5lKSB7XG4gICAgICBwcm9jZXNzTGluZShjbSwgbGluZS50ZXh0LCBzdGF0ZSk7XG4gICAgICB2YXIgc2F2ZSA9IHBvcyA9PSBuIC0gMSB8fCBwb3MgJSA1ID09IDAgfHwgcG9zID49IGRpc3BsYXkudmlld0Zyb20gJiYgcG9zIDwgZGlzcGxheS52aWV3VG87XG4gICAgICBsaW5lLnN0YXRlQWZ0ZXIgPSBzYXZlID8gY29weVN0YXRlKGRvYy5tb2RlLCBzdGF0ZSkgOiBudWxsO1xuICAgICAgKytwb3M7XG4gICAgfSk7XG4gICAgaWYgKHByZWNpc2UpIGRvYy5mcm9udGllciA9IHBvcztcbiAgICByZXR1cm4gc3RhdGU7XG4gIH1cblxuICAvLyBQT1NJVElPTiBNRUFTVVJFTUVOVFxuXG4gIGZ1bmN0aW9uIHBhZGRpbmdUb3AoZGlzcGxheSkge3JldHVybiBkaXNwbGF5LmxpbmVTcGFjZS5vZmZzZXRUb3A7fVxuICBmdW5jdGlvbiBwYWRkaW5nVmVydChkaXNwbGF5KSB7cmV0dXJuIGRpc3BsYXkubW92ZXIub2Zmc2V0SGVpZ2h0IC0gZGlzcGxheS5saW5lU3BhY2Uub2Zmc2V0SGVpZ2h0O31cbiAgZnVuY3Rpb24gcGFkZGluZ0goZGlzcGxheSkge1xuICAgIGlmIChkaXNwbGF5LmNhY2hlZFBhZGRpbmdIKSByZXR1cm4gZGlzcGxheS5jYWNoZWRQYWRkaW5nSDtcbiAgICB2YXIgZSA9IHJlbW92ZUNoaWxkcmVuQW5kQWRkKGRpc3BsYXkubWVhc3VyZSwgZWx0KFwicHJlXCIsIFwieFwiKSk7XG4gICAgdmFyIHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUgPyB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlKSA6IGUuY3VycmVudFN0eWxlO1xuICAgIHZhciBkYXRhID0ge2xlZnQ6IHBhcnNlSW50KHN0eWxlLnBhZGRpbmdMZWZ0KSwgcmlnaHQ6IHBhcnNlSW50KHN0eWxlLnBhZGRpbmdSaWdodCl9O1xuICAgIGlmICghaXNOYU4oZGF0YS5sZWZ0KSAmJiAhaXNOYU4oZGF0YS5yaWdodCkpIGRpc3BsYXkuY2FjaGVkUGFkZGluZ0ggPSBkYXRhO1xuICAgIHJldHVybiBkYXRhO1xuICB9XG5cbiAgZnVuY3Rpb24gc2Nyb2xsR2FwKGNtKSB7IHJldHVybiBzY3JvbGxlckdhcCAtIGNtLmRpc3BsYXkubmF0aXZlQmFyV2lkdGg7IH1cbiAgZnVuY3Rpb24gZGlzcGxheVdpZHRoKGNtKSB7XG4gICAgcmV0dXJuIGNtLmRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50V2lkdGggLSBzY3JvbGxHYXAoY20pIC0gY20uZGlzcGxheS5iYXJXaWR0aDtcbiAgfVxuICBmdW5jdGlvbiBkaXNwbGF5SGVpZ2h0KGNtKSB7XG4gICAgcmV0dXJuIGNtLmRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50SGVpZ2h0IC0gc2Nyb2xsR2FwKGNtKSAtIGNtLmRpc3BsYXkuYmFySGVpZ2h0O1xuICB9XG5cbiAgLy8gRW5zdXJlIHRoZSBsaW5lVmlldy53cmFwcGluZy5oZWlnaHRzIGFycmF5IGlzIHBvcHVsYXRlZC4gVGhpcyBpc1xuICAvLyBhbiBhcnJheSBvZiBib3R0b20gb2Zmc2V0cyBmb3IgdGhlIGxpbmVzIHRoYXQgbWFrZSB1cCBhIGRyYXduXG4gIC8vIGxpbmUuIFdoZW4gbGluZVdyYXBwaW5nIGlzIG9uLCB0aGVyZSBtaWdodCBiZSBtb3JlIHRoYW4gb25lXG4gIC8vIGhlaWdodC5cbiAgZnVuY3Rpb24gZW5zdXJlTGluZUhlaWdodHMoY20sIGxpbmVWaWV3LCByZWN0KSB7XG4gICAgdmFyIHdyYXBwaW5nID0gY20ub3B0aW9ucy5saW5lV3JhcHBpbmc7XG4gICAgdmFyIGN1cldpZHRoID0gd3JhcHBpbmcgJiYgZGlzcGxheVdpZHRoKGNtKTtcbiAgICBpZiAoIWxpbmVWaWV3Lm1lYXN1cmUuaGVpZ2h0cyB8fCB3cmFwcGluZyAmJiBsaW5lVmlldy5tZWFzdXJlLndpZHRoICE9IGN1cldpZHRoKSB7XG4gICAgICB2YXIgaGVpZ2h0cyA9IGxpbmVWaWV3Lm1lYXN1cmUuaGVpZ2h0cyA9IFtdO1xuICAgICAgaWYgKHdyYXBwaW5nKSB7XG4gICAgICAgIGxpbmVWaWV3Lm1lYXN1cmUud2lkdGggPSBjdXJXaWR0aDtcbiAgICAgICAgdmFyIHJlY3RzID0gbGluZVZpZXcudGV4dC5maXJzdENoaWxkLmdldENsaWVudFJlY3RzKCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVjdHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgICAgdmFyIGN1ciA9IHJlY3RzW2ldLCBuZXh0ID0gcmVjdHNbaSArIDFdO1xuICAgICAgICAgIGlmIChNYXRoLmFicyhjdXIuYm90dG9tIC0gbmV4dC5ib3R0b20pID4gMilcbiAgICAgICAgICAgIGhlaWdodHMucHVzaCgoY3VyLmJvdHRvbSArIG5leHQudG9wKSAvIDIgLSByZWN0LnRvcCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGhlaWdodHMucHVzaChyZWN0LmJvdHRvbSAtIHJlY3QudG9wKTtcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIGEgbGluZSBtYXAgKG1hcHBpbmcgY2hhcmFjdGVyIG9mZnNldHMgdG8gdGV4dCBub2RlcykgYW5kIGFcbiAgLy8gbWVhc3VyZW1lbnQgY2FjaGUgZm9yIHRoZSBnaXZlbiBsaW5lIG51bWJlci4gKEEgbGluZSB2aWV3IG1pZ2h0XG4gIC8vIGNvbnRhaW4gbXVsdGlwbGUgbGluZXMgd2hlbiBjb2xsYXBzZWQgcmFuZ2VzIGFyZSBwcmVzZW50LilcbiAgZnVuY3Rpb24gbWFwRnJvbUxpbmVWaWV3KGxpbmVWaWV3LCBsaW5lLCBsaW5lTikge1xuICAgIGlmIChsaW5lVmlldy5saW5lID09IGxpbmUpXG4gICAgICByZXR1cm4ge21hcDogbGluZVZpZXcubWVhc3VyZS5tYXAsIGNhY2hlOiBsaW5lVmlldy5tZWFzdXJlLmNhY2hlfTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVWaWV3LnJlc3QubGVuZ3RoOyBpKyspXG4gICAgICBpZiAobGluZVZpZXcucmVzdFtpXSA9PSBsaW5lKVxuICAgICAgICByZXR1cm4ge21hcDogbGluZVZpZXcubWVhc3VyZS5tYXBzW2ldLCBjYWNoZTogbGluZVZpZXcubWVhc3VyZS5jYWNoZXNbaV19O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZVZpZXcucmVzdC5sZW5ndGg7IGkrKylcbiAgICAgIGlmIChsaW5lTm8obGluZVZpZXcucmVzdFtpXSkgPiBsaW5lTilcbiAgICAgICAgcmV0dXJuIHttYXA6IGxpbmVWaWV3Lm1lYXN1cmUubWFwc1tpXSwgY2FjaGU6IGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzW2ldLCBiZWZvcmU6IHRydWV9O1xuICB9XG5cbiAgLy8gUmVuZGVyIGEgbGluZSBpbnRvIHRoZSBoaWRkZW4gbm9kZSBkaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQuIFVzZWRcbiAgLy8gd2hlbiBtZWFzdXJlbWVudCBpcyBuZWVkZWQgZm9yIGEgbGluZSB0aGF0J3Mgbm90IGluIHRoZSB2aWV3cG9ydC5cbiAgZnVuY3Rpb24gdXBkYXRlRXh0ZXJuYWxNZWFzdXJlbWVudChjbSwgbGluZSkge1xuICAgIGxpbmUgPSB2aXN1YWxMaW5lKGxpbmUpO1xuICAgIHZhciBsaW5lTiA9IGxpbmVObyhsaW5lKTtcbiAgICB2YXIgdmlldyA9IGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCA9IG5ldyBMaW5lVmlldyhjbS5kb2MsIGxpbmUsIGxpbmVOKTtcbiAgICB2aWV3LmxpbmVOID0gbGluZU47XG4gICAgdmFyIGJ1aWx0ID0gdmlldy5idWlsdCA9IGJ1aWxkTGluZUNvbnRlbnQoY20sIHZpZXcpO1xuICAgIHZpZXcudGV4dCA9IGJ1aWx0LnByZTtcbiAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChjbS5kaXNwbGF5LmxpbmVNZWFzdXJlLCBidWlsdC5wcmUpO1xuICAgIHJldHVybiB2aWV3O1xuICB9XG5cbiAgLy8gR2V0IGEge3RvcCwgYm90dG9tLCBsZWZ0LCByaWdodH0gYm94IChpbiBsaW5lLWxvY2FsIGNvb3JkaW5hdGVzKVxuICAvLyBmb3IgYSBnaXZlbiBjaGFyYWN0ZXIuXG4gIGZ1bmN0aW9uIG1lYXN1cmVDaGFyKGNtLCBsaW5lLCBjaCwgYmlhcykge1xuICAgIHJldHVybiBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmUpLCBjaCwgYmlhcyk7XG4gIH1cblxuICAvLyBGaW5kIGEgbGluZSB2aWV3IHRoYXQgY29ycmVzcG9uZHMgdG8gdGhlIGdpdmVuIGxpbmUgbnVtYmVyLlxuICBmdW5jdGlvbiBmaW5kVmlld0ZvckxpbmUoY20sIGxpbmVOKSB7XG4gICAgaWYgKGxpbmVOID49IGNtLmRpc3BsYXkudmlld0Zyb20gJiYgbGluZU4gPCBjbS5kaXNwbGF5LnZpZXdUbylcbiAgICAgIHJldHVybiBjbS5kaXNwbGF5LnZpZXdbZmluZFZpZXdJbmRleChjbSwgbGluZU4pXTtcbiAgICB2YXIgZXh0ID0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkO1xuICAgIGlmIChleHQgJiYgbGluZU4gPj0gZXh0LmxpbmVOICYmIGxpbmVOIDwgZXh0LmxpbmVOICsgZXh0LnNpemUpXG4gICAgICByZXR1cm4gZXh0O1xuICB9XG5cbiAgLy8gTWVhc3VyZW1lbnQgY2FuIGJlIHNwbGl0IGluIHR3byBzdGVwcywgdGhlIHNldC11cCB3b3JrIHRoYXRcbiAgLy8gYXBwbGllcyB0byB0aGUgd2hvbGUgbGluZSwgYW5kIHRoZSBtZWFzdXJlbWVudCBvZiB0aGUgYWN0dWFsXG4gIC8vIGNoYXJhY3Rlci4gRnVuY3Rpb25zIGxpa2UgY29vcmRzQ2hhciwgdGhhdCBuZWVkIHRvIGRvIGEgbG90IG9mXG4gIC8vIG1lYXN1cmVtZW50cyBpbiBhIHJvdywgY2FuIHRodXMgZW5zdXJlIHRoYXQgdGhlIHNldC11cCB3b3JrIGlzXG4gIC8vIG9ubHkgZG9uZSBvbmNlLlxuICBmdW5jdGlvbiBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmUpIHtcbiAgICB2YXIgbGluZU4gPSBsaW5lTm8obGluZSk7XG4gICAgdmFyIHZpZXcgPSBmaW5kVmlld0ZvckxpbmUoY20sIGxpbmVOKTtcbiAgICBpZiAodmlldyAmJiAhdmlldy50ZXh0KSB7XG4gICAgICB2aWV3ID0gbnVsbDtcbiAgICB9IGVsc2UgaWYgKHZpZXcgJiYgdmlldy5jaGFuZ2VzKSB7XG4gICAgICB1cGRhdGVMaW5lRm9yQ2hhbmdlcyhjbSwgdmlldywgbGluZU4sIGdldERpbWVuc2lvbnMoY20pKTtcbiAgICAgIGNtLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKCF2aWV3KVxuICAgICAgdmlldyA9IHVwZGF0ZUV4dGVybmFsTWVhc3VyZW1lbnQoY20sIGxpbmUpO1xuXG4gICAgdmFyIGluZm8gPSBtYXBGcm9tTGluZVZpZXcodmlldywgbGluZSwgbGluZU4pO1xuICAgIHJldHVybiB7XG4gICAgICBsaW5lOiBsaW5lLCB2aWV3OiB2aWV3LCByZWN0OiBudWxsLFxuICAgICAgbWFwOiBpbmZvLm1hcCwgY2FjaGU6IGluZm8uY2FjaGUsIGJlZm9yZTogaW5mby5iZWZvcmUsXG4gICAgICBoYXNIZWlnaHRzOiBmYWxzZVxuICAgIH07XG4gIH1cblxuICAvLyBHaXZlbiBhIHByZXBhcmVkIG1lYXN1cmVtZW50IG9iamVjdCwgbWVhc3VyZXMgdGhlIHBvc2l0aW9uIG9mIGFuXG4gIC8vIGFjdHVhbCBjaGFyYWN0ZXIgKG9yIGZldGNoZXMgaXQgZnJvbSB0aGUgY2FjaGUpLlxuICBmdW5jdGlvbiBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZCwgY2gsIGJpYXMsIHZhckhlaWdodCkge1xuICAgIGlmIChwcmVwYXJlZC5iZWZvcmUpIGNoID0gLTE7XG4gICAgdmFyIGtleSA9IGNoICsgKGJpYXMgfHwgXCJcIiksIGZvdW5kO1xuICAgIGlmIChwcmVwYXJlZC5jYWNoZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICBmb3VuZCA9IHByZXBhcmVkLmNhY2hlW2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghcHJlcGFyZWQucmVjdClcbiAgICAgICAgcHJlcGFyZWQucmVjdCA9IHByZXBhcmVkLnZpZXcudGV4dC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGlmICghcHJlcGFyZWQuaGFzSGVpZ2h0cykge1xuICAgICAgICBlbnN1cmVMaW5lSGVpZ2h0cyhjbSwgcHJlcGFyZWQudmlldywgcHJlcGFyZWQucmVjdCk7XG4gICAgICAgIHByZXBhcmVkLmhhc0hlaWdodHMgPSB0cnVlO1xuICAgICAgfVxuICAgICAgZm91bmQgPSBtZWFzdXJlQ2hhcklubmVyKGNtLCBwcmVwYXJlZCwgY2gsIGJpYXMpO1xuICAgICAgaWYgKCFmb3VuZC5ib2d1cykgcHJlcGFyZWQuY2FjaGVba2V5XSA9IGZvdW5kO1xuICAgIH1cbiAgICByZXR1cm4ge2xlZnQ6IGZvdW5kLmxlZnQsIHJpZ2h0OiBmb3VuZC5yaWdodCxcbiAgICAgICAgICAgIHRvcDogdmFySGVpZ2h0ID8gZm91bmQucnRvcCA6IGZvdW5kLnRvcCxcbiAgICAgICAgICAgIGJvdHRvbTogdmFySGVpZ2h0ID8gZm91bmQucmJvdHRvbSA6IGZvdW5kLmJvdHRvbX07XG4gIH1cblxuICB2YXIgbnVsbFJlY3QgPSB7bGVmdDogMCwgcmlnaHQ6IDAsIHRvcDogMCwgYm90dG9tOiAwfTtcblxuICBmdW5jdGlvbiBub2RlQW5kT2Zmc2V0SW5MaW5lTWFwKG1hcCwgY2gsIGJpYXMpIHtcbiAgICB2YXIgbm9kZSwgc3RhcnQsIGVuZCwgY29sbGFwc2U7XG4gICAgLy8gRmlyc3QsIHNlYXJjaCB0aGUgbGluZSBtYXAgZm9yIHRoZSB0ZXh0IG5vZGUgY29ycmVzcG9uZGluZyB0byxcbiAgICAvLyBvciBjbG9zZXN0IHRvLCB0aGUgdGFyZ2V0IGNoYXJhY3Rlci5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcC5sZW5ndGg7IGkgKz0gMykge1xuICAgICAgdmFyIG1TdGFydCA9IG1hcFtpXSwgbUVuZCA9IG1hcFtpICsgMV07XG4gICAgICBpZiAoY2ggPCBtU3RhcnQpIHtcbiAgICAgICAgc3RhcnQgPSAwOyBlbmQgPSAxO1xuICAgICAgICBjb2xsYXBzZSA9IFwibGVmdFwiO1xuICAgICAgfSBlbHNlIGlmIChjaCA8IG1FbmQpIHtcbiAgICAgICAgc3RhcnQgPSBjaCAtIG1TdGFydDtcbiAgICAgICAgZW5kID0gc3RhcnQgKyAxO1xuICAgICAgfSBlbHNlIGlmIChpID09IG1hcC5sZW5ndGggLSAzIHx8IGNoID09IG1FbmQgJiYgbWFwW2kgKyAzXSA+IGNoKSB7XG4gICAgICAgIGVuZCA9IG1FbmQgLSBtU3RhcnQ7XG4gICAgICAgIHN0YXJ0ID0gZW5kIC0gMTtcbiAgICAgICAgaWYgKGNoID49IG1FbmQpIGNvbGxhcHNlID0gXCJyaWdodFwiO1xuICAgICAgfVxuICAgICAgaWYgKHN0YXJ0ICE9IG51bGwpIHtcbiAgICAgICAgbm9kZSA9IG1hcFtpICsgMl07XG4gICAgICAgIGlmIChtU3RhcnQgPT0gbUVuZCAmJiBiaWFzID09IChub2RlLmluc2VydExlZnQgPyBcImxlZnRcIiA6IFwicmlnaHRcIikpXG4gICAgICAgICAgY29sbGFwc2UgPSBiaWFzO1xuICAgICAgICBpZiAoYmlhcyA9PSBcImxlZnRcIiAmJiBzdGFydCA9PSAwKVxuICAgICAgICAgIHdoaWxlIChpICYmIG1hcFtpIC0gMl0gPT0gbWFwW2kgLSAzXSAmJiBtYXBbaSAtIDFdLmluc2VydExlZnQpIHtcbiAgICAgICAgICAgIG5vZGUgPSBtYXBbKGkgLT0gMykgKyAyXTtcbiAgICAgICAgICAgIGNvbGxhcHNlID0gXCJsZWZ0XCI7XG4gICAgICAgICAgfVxuICAgICAgICBpZiAoYmlhcyA9PSBcInJpZ2h0XCIgJiYgc3RhcnQgPT0gbUVuZCAtIG1TdGFydClcbiAgICAgICAgICB3aGlsZSAoaSA8IG1hcC5sZW5ndGggLSAzICYmIG1hcFtpICsgM10gPT0gbWFwW2kgKyA0XSAmJiAhbWFwW2kgKyA1XS5pbnNlcnRMZWZ0KSB7XG4gICAgICAgICAgICBub2RlID0gbWFwWyhpICs9IDMpICsgMl07XG4gICAgICAgICAgICBjb2xsYXBzZSA9IFwicmlnaHRcIjtcbiAgICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge25vZGU6IG5vZGUsIHN0YXJ0OiBzdGFydCwgZW5kOiBlbmQsIGNvbGxhcHNlOiBjb2xsYXBzZSwgY292ZXJTdGFydDogbVN0YXJ0LCBjb3ZlckVuZDogbUVuZH07XG4gIH1cblxuICBmdW5jdGlvbiBtZWFzdXJlQ2hhcklubmVyKGNtLCBwcmVwYXJlZCwgY2gsIGJpYXMpIHtcbiAgICB2YXIgcGxhY2UgPSBub2RlQW5kT2Zmc2V0SW5MaW5lTWFwKHByZXBhcmVkLm1hcCwgY2gsIGJpYXMpO1xuICAgIHZhciBub2RlID0gcGxhY2Uubm9kZSwgc3RhcnQgPSBwbGFjZS5zdGFydCwgZW5kID0gcGxhY2UuZW5kLCBjb2xsYXBzZSA9IHBsYWNlLmNvbGxhcHNlO1xuXG4gICAgdmFyIHJlY3Q7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT0gMykgeyAvLyBJZiBpdCBpcyBhIHRleHQgbm9kZSwgdXNlIGEgcmFuZ2UgdG8gcmV0cmlldmUgdGhlIGNvb3JkaW5hdGVzLlxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA0OyBpKyspIHsgLy8gUmV0cnkgYSBtYXhpbXVtIG9mIDQgdGltZXMgd2hlbiBub25zZW5zZSByZWN0YW5nbGVzIGFyZSByZXR1cm5lZFxuICAgICAgICB3aGlsZSAoc3RhcnQgJiYgaXNFeHRlbmRpbmdDaGFyKHByZXBhcmVkLmxpbmUudGV4dC5jaGFyQXQocGxhY2UuY292ZXJTdGFydCArIHN0YXJ0KSkpIC0tc3RhcnQ7XG4gICAgICAgIHdoaWxlIChwbGFjZS5jb3ZlclN0YXJ0ICsgZW5kIDwgcGxhY2UuY292ZXJFbmQgJiYgaXNFeHRlbmRpbmdDaGFyKHByZXBhcmVkLmxpbmUudGV4dC5jaGFyQXQocGxhY2UuY292ZXJTdGFydCArIGVuZCkpKSArK2VuZDtcbiAgICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5ICYmIHN0YXJ0ID09IDAgJiYgZW5kID09IHBsYWNlLmNvdmVyRW5kIC0gcGxhY2UuY292ZXJTdGFydCkge1xuICAgICAgICAgIHJlY3QgPSBub2RlLnBhcmVudE5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaWUgJiYgY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICAgICAgICB2YXIgcmVjdHMgPSByYW5nZShub2RlLCBzdGFydCwgZW5kKS5nZXRDbGllbnRSZWN0cygpO1xuICAgICAgICAgIGlmIChyZWN0cy5sZW5ndGgpXG4gICAgICAgICAgICByZWN0ID0gcmVjdHNbYmlhcyA9PSBcInJpZ2h0XCIgPyByZWN0cy5sZW5ndGggLSAxIDogMF07XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmVjdCA9IG51bGxSZWN0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlY3QgPSByYW5nZShub2RlLCBzdGFydCwgZW5kKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSB8fCBudWxsUmVjdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVjdC5sZWZ0IHx8IHJlY3QucmlnaHQgfHwgc3RhcnQgPT0gMCkgYnJlYWs7XG4gICAgICAgIGVuZCA9IHN0YXJ0O1xuICAgICAgICBzdGFydCA9IHN0YXJ0IC0gMTtcbiAgICAgICAgY29sbGFwc2UgPSBcInJpZ2h0XCI7XG4gICAgICB9XG4gICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDExKSByZWN0ID0gbWF5YmVVcGRhdGVSZWN0Rm9yWm9vbWluZyhjbS5kaXNwbGF5Lm1lYXN1cmUsIHJlY3QpO1xuICAgIH0gZWxzZSB7IC8vIElmIGl0IGlzIGEgd2lkZ2V0LCBzaW1wbHkgZ2V0IHRoZSBib3ggZm9yIHRoZSB3aG9sZSB3aWRnZXQuXG4gICAgICBpZiAoc3RhcnQgPiAwKSBjb2xsYXBzZSA9IGJpYXMgPSBcInJpZ2h0XCI7XG4gICAgICB2YXIgcmVjdHM7XG4gICAgICBpZiAoY20ub3B0aW9ucy5saW5lV3JhcHBpbmcgJiYgKHJlY3RzID0gbm9kZS5nZXRDbGllbnRSZWN0cygpKS5sZW5ndGggPiAxKVxuICAgICAgICByZWN0ID0gcmVjdHNbYmlhcyA9PSBcInJpZ2h0XCIgPyByZWN0cy5sZW5ndGggLSAxIDogMF07XG4gICAgICBlbHNlXG4gICAgICAgIHJlY3QgPSBub2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIH1cbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkgJiYgIXN0YXJ0ICYmICghcmVjdCB8fCAhcmVjdC5sZWZ0ICYmICFyZWN0LnJpZ2h0KSkge1xuICAgICAgdmFyIHJTcGFuID0gbm9kZS5wYXJlbnROb2RlLmdldENsaWVudFJlY3RzKClbMF07XG4gICAgICBpZiAoclNwYW4pXG4gICAgICAgIHJlY3QgPSB7bGVmdDogclNwYW4ubGVmdCwgcmlnaHQ6IHJTcGFuLmxlZnQgKyBjaGFyV2lkdGgoY20uZGlzcGxheSksIHRvcDogclNwYW4udG9wLCBib3R0b206IHJTcGFuLmJvdHRvbX07XG4gICAgICBlbHNlXG4gICAgICAgIHJlY3QgPSBudWxsUmVjdDtcbiAgICB9XG5cbiAgICB2YXIgcnRvcCA9IHJlY3QudG9wIC0gcHJlcGFyZWQucmVjdC50b3AsIHJib3QgPSByZWN0LmJvdHRvbSAtIHByZXBhcmVkLnJlY3QudG9wO1xuICAgIHZhciBtaWQgPSAocnRvcCArIHJib3QpIC8gMjtcbiAgICB2YXIgaGVpZ2h0cyA9IHByZXBhcmVkLnZpZXcubWVhc3VyZS5oZWlnaHRzO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGVpZ2h0cy5sZW5ndGggLSAxOyBpKyspXG4gICAgICBpZiAobWlkIDwgaGVpZ2h0c1tpXSkgYnJlYWs7XG4gICAgdmFyIHRvcCA9IGkgPyBoZWlnaHRzW2kgLSAxXSA6IDAsIGJvdCA9IGhlaWdodHNbaV07XG4gICAgdmFyIHJlc3VsdCA9IHtsZWZ0OiAoY29sbGFwc2UgPT0gXCJyaWdodFwiID8gcmVjdC5yaWdodCA6IHJlY3QubGVmdCkgLSBwcmVwYXJlZC5yZWN0LmxlZnQsXG4gICAgICAgICAgICAgICAgICByaWdodDogKGNvbGxhcHNlID09IFwibGVmdFwiID8gcmVjdC5sZWZ0IDogcmVjdC5yaWdodCkgLSBwcmVwYXJlZC5yZWN0LmxlZnQsXG4gICAgICAgICAgICAgICAgICB0b3A6IHRvcCwgYm90dG9tOiBib3R9O1xuICAgIGlmICghcmVjdC5sZWZ0ICYmICFyZWN0LnJpZ2h0KSByZXN1bHQuYm9ndXMgPSB0cnVlO1xuICAgIGlmICghY20ub3B0aW9ucy5zaW5nbGVDdXJzb3JIZWlnaHRQZXJMaW5lKSB7IHJlc3VsdC5ydG9wID0gcnRvcDsgcmVzdWx0LnJib3R0b20gPSByYm90OyB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gV29yayBhcm91bmQgcHJvYmxlbSB3aXRoIGJvdW5kaW5nIGNsaWVudCByZWN0cyBvbiByYW5nZXMgYmVpbmdcbiAgLy8gcmV0dXJuZWQgaW5jb3JyZWN0bHkgd2hlbiB6b29tZWQgb24gSUUxMCBhbmQgYmVsb3cuXG4gIGZ1bmN0aW9uIG1heWJlVXBkYXRlUmVjdEZvclpvb21pbmcobWVhc3VyZSwgcmVjdCkge1xuICAgIGlmICghd2luZG93LnNjcmVlbiB8fCBzY3JlZW4ubG9naWNhbFhEUEkgPT0gbnVsbCB8fFxuICAgICAgICBzY3JlZW4ubG9naWNhbFhEUEkgPT0gc2NyZWVuLmRldmljZVhEUEkgfHwgIWhhc0JhZFpvb21lZFJlY3RzKG1lYXN1cmUpKVxuICAgICAgcmV0dXJuIHJlY3Q7XG4gICAgdmFyIHNjYWxlWCA9IHNjcmVlbi5sb2dpY2FsWERQSSAvIHNjcmVlbi5kZXZpY2VYRFBJO1xuICAgIHZhciBzY2FsZVkgPSBzY3JlZW4ubG9naWNhbFlEUEkgLyBzY3JlZW4uZGV2aWNlWURQSTtcbiAgICByZXR1cm4ge2xlZnQ6IHJlY3QubGVmdCAqIHNjYWxlWCwgcmlnaHQ6IHJlY3QucmlnaHQgKiBzY2FsZVgsXG4gICAgICAgICAgICB0b3A6IHJlY3QudG9wICogc2NhbGVZLCBib3R0b206IHJlY3QuYm90dG9tICogc2NhbGVZfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGVGb3IobGluZVZpZXcpIHtcbiAgICBpZiAobGluZVZpZXcubWVhc3VyZSkge1xuICAgICAgbGluZVZpZXcubWVhc3VyZS5jYWNoZSA9IHt9O1xuICAgICAgbGluZVZpZXcubWVhc3VyZS5oZWlnaHRzID0gbnVsbDtcbiAgICAgIGlmIChsaW5lVmlldy5yZXN0KSBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVWaWV3LnJlc3QubGVuZ3RoOyBpKyspXG4gICAgICAgIGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzW2ldID0ge307XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZShjbSkge1xuICAgIGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlID0gbnVsbDtcbiAgICByZW1vdmVDaGlsZHJlbihjbS5kaXNwbGF5LmxpbmVNZWFzdXJlKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNtLmRpc3BsYXkudmlldy5sZW5ndGg7IGkrKylcbiAgICAgIGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGVGb3IoY20uZGlzcGxheS52aWV3W2ldKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyQ2FjaGVzKGNtKSB7XG4gICAgY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZShjbSk7XG4gICAgY20uZGlzcGxheS5jYWNoZWRDaGFyV2lkdGggPSBjbS5kaXNwbGF5LmNhY2hlZFRleHRIZWlnaHQgPSBjbS5kaXNwbGF5LmNhY2hlZFBhZGRpbmdIID0gbnVsbDtcbiAgICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSBjbS5kaXNwbGF5Lm1heExpbmVDaGFuZ2VkID0gdHJ1ZTtcbiAgICBjbS5kaXNwbGF5LmxpbmVOdW1DaGFycyA9IG51bGw7XG4gIH1cblxuICBmdW5jdGlvbiBwYWdlU2Nyb2xsWCgpIHsgcmV0dXJuIHdpbmRvdy5wYWdlWE9mZnNldCB8fCAoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGRvY3VtZW50LmJvZHkpLnNjcm9sbExlZnQ7IH1cbiAgZnVuY3Rpb24gcGFnZVNjcm9sbFkoKSB7IHJldHVybiB3aW5kb3cucGFnZVlPZmZzZXQgfHwgKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCB8fCBkb2N1bWVudC5ib2R5KS5zY3JvbGxUb3A7IH1cblxuICAvLyBDb252ZXJ0cyBhIHt0b3AsIGJvdHRvbSwgbGVmdCwgcmlnaHR9IGJveCBmcm9tIGxpbmUtbG9jYWxcbiAgLy8gY29vcmRpbmF0ZXMgaW50byBhbm90aGVyIGNvb3JkaW5hdGUgc3lzdGVtLiBDb250ZXh0IG1heSBiZSBvbmUgb2ZcbiAgLy8gXCJsaW5lXCIsIFwiZGl2XCIgKGRpc3BsYXkubGluZURpdiksIFwibG9jYWxcIi9udWxsIChlZGl0b3IpLCBcIndpbmRvd1wiLFxuICAvLyBvciBcInBhZ2VcIi5cbiAgZnVuY3Rpb24gaW50b0Nvb3JkU3lzdGVtKGNtLCBsaW5lT2JqLCByZWN0LCBjb250ZXh0KSB7XG4gICAgaWYgKGxpbmVPYmoud2lkZ2V0cykgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lT2JqLndpZGdldHMubGVuZ3RoOyArK2kpIGlmIChsaW5lT2JqLndpZGdldHNbaV0uYWJvdmUpIHtcbiAgICAgIHZhciBzaXplID0gd2lkZ2V0SGVpZ2h0KGxpbmVPYmoud2lkZ2V0c1tpXSk7XG4gICAgICByZWN0LnRvcCArPSBzaXplOyByZWN0LmJvdHRvbSArPSBzaXplO1xuICAgIH1cbiAgICBpZiAoY29udGV4dCA9PSBcImxpbmVcIikgcmV0dXJuIHJlY3Q7XG4gICAgaWYgKCFjb250ZXh0KSBjb250ZXh0ID0gXCJsb2NhbFwiO1xuICAgIHZhciB5T2ZmID0gaGVpZ2h0QXRMaW5lKGxpbmVPYmopO1xuICAgIGlmIChjb250ZXh0ID09IFwibG9jYWxcIikgeU9mZiArPSBwYWRkaW5nVG9wKGNtLmRpc3BsYXkpO1xuICAgIGVsc2UgeU9mZiAtPSBjbS5kaXNwbGF5LnZpZXdPZmZzZXQ7XG4gICAgaWYgKGNvbnRleHQgPT0gXCJwYWdlXCIgfHwgY29udGV4dCA9PSBcIndpbmRvd1wiKSB7XG4gICAgICB2YXIgbE9mZiA9IGNtLmRpc3BsYXkubGluZVNwYWNlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgeU9mZiArPSBsT2ZmLnRvcCArIChjb250ZXh0ID09IFwid2luZG93XCIgPyAwIDogcGFnZVNjcm9sbFkoKSk7XG4gICAgICB2YXIgeE9mZiA9IGxPZmYubGVmdCArIChjb250ZXh0ID09IFwid2luZG93XCIgPyAwIDogcGFnZVNjcm9sbFgoKSk7XG4gICAgICByZWN0LmxlZnQgKz0geE9mZjsgcmVjdC5yaWdodCArPSB4T2ZmO1xuICAgIH1cbiAgICByZWN0LnRvcCArPSB5T2ZmOyByZWN0LmJvdHRvbSArPSB5T2ZmO1xuICAgIHJldHVybiByZWN0O1xuICB9XG5cbiAgLy8gQ292ZXJ0cyBhIGJveCBmcm9tIFwiZGl2XCIgY29vcmRzIHRvIGFub3RoZXIgY29vcmRpbmF0ZSBzeXN0ZW0uXG4gIC8vIENvbnRleHQgbWF5IGJlIFwid2luZG93XCIsIFwicGFnZVwiLCBcImRpdlwiLCBvciBcImxvY2FsXCIvbnVsbC5cbiAgZnVuY3Rpb24gZnJvbUNvb3JkU3lzdGVtKGNtLCBjb29yZHMsIGNvbnRleHQpIHtcbiAgICBpZiAoY29udGV4dCA9PSBcImRpdlwiKSByZXR1cm4gY29vcmRzO1xuICAgIHZhciBsZWZ0ID0gY29vcmRzLmxlZnQsIHRvcCA9IGNvb3Jkcy50b3A7XG4gICAgLy8gRmlyc3QgbW92ZSBpbnRvIFwicGFnZVwiIGNvb3JkaW5hdGUgc3lzdGVtXG4gICAgaWYgKGNvbnRleHQgPT0gXCJwYWdlXCIpIHtcbiAgICAgIGxlZnQgLT0gcGFnZVNjcm9sbFgoKTtcbiAgICAgIHRvcCAtPSBwYWdlU2Nyb2xsWSgpO1xuICAgIH0gZWxzZSBpZiAoY29udGV4dCA9PSBcImxvY2FsXCIgfHwgIWNvbnRleHQpIHtcbiAgICAgIHZhciBsb2NhbEJveCA9IGNtLmRpc3BsYXkuc2l6ZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBsZWZ0ICs9IGxvY2FsQm94LmxlZnQ7XG4gICAgICB0b3AgKz0gbG9jYWxCb3gudG9wO1xuICAgIH1cblxuICAgIHZhciBsaW5lU3BhY2VCb3ggPSBjbS5kaXNwbGF5LmxpbmVTcGFjZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICByZXR1cm4ge2xlZnQ6IGxlZnQgLSBsaW5lU3BhY2VCb3gubGVmdCwgdG9wOiB0b3AgLSBsaW5lU3BhY2VCb3gudG9wfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNoYXJDb29yZHMoY20sIHBvcywgY29udGV4dCwgbGluZU9iaiwgYmlhcykge1xuICAgIGlmICghbGluZU9iaikgbGluZU9iaiA9IGdldExpbmUoY20uZG9jLCBwb3MubGluZSk7XG4gICAgcmV0dXJuIGludG9Db29yZFN5c3RlbShjbSwgbGluZU9iaiwgbWVhc3VyZUNoYXIoY20sIGxpbmVPYmosIHBvcy5jaCwgYmlhcyksIGNvbnRleHQpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIGJveCBmb3IgYSBnaXZlbiBjdXJzb3IgcG9zaXRpb24sIHdoaWNoIG1heSBoYXZlIGFuXG4gIC8vICdvdGhlcicgcHJvcGVydHkgY29udGFpbmluZyB0aGUgcG9zaXRpb24gb2YgdGhlIHNlY29uZGFyeSBjdXJzb3JcbiAgLy8gb24gYSBiaWRpIGJvdW5kYXJ5LlxuICBmdW5jdGlvbiBjdXJzb3JDb29yZHMoY20sIHBvcywgY29udGV4dCwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlLCB2YXJIZWlnaHQpIHtcbiAgICBsaW5lT2JqID0gbGluZU9iaiB8fCBnZXRMaW5lKGNtLmRvYywgcG9zLmxpbmUpO1xuICAgIGlmICghcHJlcGFyZWRNZWFzdXJlKSBwcmVwYXJlZE1lYXN1cmUgPSBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmVPYmopO1xuICAgIGZ1bmN0aW9uIGdldChjaCwgcmlnaHQpIHtcbiAgICAgIHZhciBtID0gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCBjaCwgcmlnaHQgPyBcInJpZ2h0XCIgOiBcImxlZnRcIiwgdmFySGVpZ2h0KTtcbiAgICAgIGlmIChyaWdodCkgbS5sZWZ0ID0gbS5yaWdodDsgZWxzZSBtLnJpZ2h0ID0gbS5sZWZ0O1xuICAgICAgcmV0dXJuIGludG9Db29yZFN5c3RlbShjbSwgbGluZU9iaiwgbSwgY29udGV4dCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldEJpZGkoY2gsIHBhcnRQb3MpIHtcbiAgICAgIHZhciBwYXJ0ID0gb3JkZXJbcGFydFBvc10sIHJpZ2h0ID0gcGFydC5sZXZlbCAlIDI7XG4gICAgICBpZiAoY2ggPT0gYmlkaUxlZnQocGFydCkgJiYgcGFydFBvcyAmJiBwYXJ0LmxldmVsIDwgb3JkZXJbcGFydFBvcyAtIDFdLmxldmVsKSB7XG4gICAgICAgIHBhcnQgPSBvcmRlclstLXBhcnRQb3NdO1xuICAgICAgICBjaCA9IGJpZGlSaWdodChwYXJ0KSAtIChwYXJ0LmxldmVsICUgMiA/IDAgOiAxKTtcbiAgICAgICAgcmlnaHQgPSB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChjaCA9PSBiaWRpUmlnaHQocGFydCkgJiYgcGFydFBvcyA8IG9yZGVyLmxlbmd0aCAtIDEgJiYgcGFydC5sZXZlbCA8IG9yZGVyW3BhcnRQb3MgKyAxXS5sZXZlbCkge1xuICAgICAgICBwYXJ0ID0gb3JkZXJbKytwYXJ0UG9zXTtcbiAgICAgICAgY2ggPSBiaWRpTGVmdChwYXJ0KSAtIHBhcnQubGV2ZWwgJSAyO1xuICAgICAgICByaWdodCA9IGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKHJpZ2h0ICYmIGNoID09IHBhcnQudG8gJiYgY2ggPiBwYXJ0LmZyb20pIHJldHVybiBnZXQoY2ggLSAxKTtcbiAgICAgIHJldHVybiBnZXQoY2gsIHJpZ2h0KTtcbiAgICB9XG4gICAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZU9iaiksIGNoID0gcG9zLmNoO1xuICAgIGlmICghb3JkZXIpIHJldHVybiBnZXQoY2gpO1xuICAgIHZhciBwYXJ0UG9zID0gZ2V0QmlkaVBhcnRBdChvcmRlciwgY2gpO1xuICAgIHZhciB2YWwgPSBnZXRCaWRpKGNoLCBwYXJ0UG9zKTtcbiAgICBpZiAoYmlkaU90aGVyICE9IG51bGwpIHZhbC5vdGhlciA9IGdldEJpZGkoY2gsIGJpZGlPdGhlcik7XG4gICAgcmV0dXJuIHZhbDtcbiAgfVxuXG4gIC8vIFVzZWQgdG8gY2hlYXBseSBlc3RpbWF0ZSB0aGUgY29vcmRpbmF0ZXMgZm9yIGEgcG9zaXRpb24uIFVzZWQgZm9yXG4gIC8vIGludGVybWVkaWF0ZSBzY3JvbGwgdXBkYXRlcy5cbiAgZnVuY3Rpb24gZXN0aW1hdGVDb29yZHMoY20sIHBvcykge1xuICAgIHZhciBsZWZ0ID0gMCwgcG9zID0gY2xpcFBvcyhjbS5kb2MsIHBvcyk7XG4gICAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykgbGVmdCA9IGNoYXJXaWR0aChjbS5kaXNwbGF5KSAqIHBvcy5jaDtcbiAgICB2YXIgbGluZU9iaiA9IGdldExpbmUoY20uZG9jLCBwb3MubGluZSk7XG4gICAgdmFyIHRvcCA9IGhlaWdodEF0TGluZShsaW5lT2JqKSArIHBhZGRpbmdUb3AoY20uZGlzcGxheSk7XG4gICAgcmV0dXJuIHtsZWZ0OiBsZWZ0LCByaWdodDogbGVmdCwgdG9wOiB0b3AsIGJvdHRvbTogdG9wICsgbGluZU9iai5oZWlnaHR9O1xuICB9XG5cbiAgLy8gUG9zaXRpb25zIHJldHVybmVkIGJ5IGNvb3Jkc0NoYXIgY29udGFpbiBzb21lIGV4dHJhIGluZm9ybWF0aW9uLlxuICAvLyB4UmVsIGlzIHRoZSByZWxhdGl2ZSB4IHBvc2l0aW9uIG9mIHRoZSBpbnB1dCBjb29yZGluYXRlcyBjb21wYXJlZFxuICAvLyB0byB0aGUgZm91bmQgcG9zaXRpb24gKHNvIHhSZWwgPiAwIG1lYW5zIHRoZSBjb29yZGluYXRlcyBhcmUgdG9cbiAgLy8gdGhlIHJpZ2h0IG9mIHRoZSBjaGFyYWN0ZXIgcG9zaXRpb24sIGZvciBleGFtcGxlKS4gV2hlbiBvdXRzaWRlXG4gIC8vIGlzIHRydWUsIHRoYXQgbWVhbnMgdGhlIGNvb3JkaW5hdGVzIGxpZSBvdXRzaWRlIHRoZSBsaW5lJ3NcbiAgLy8gdmVydGljYWwgcmFuZ2UuXG4gIGZ1bmN0aW9uIFBvc1dpdGhJbmZvKGxpbmUsIGNoLCBvdXRzaWRlLCB4UmVsKSB7XG4gICAgdmFyIHBvcyA9IFBvcyhsaW5lLCBjaCk7XG4gICAgcG9zLnhSZWwgPSB4UmVsO1xuICAgIGlmIChvdXRzaWRlKSBwb3Mub3V0c2lkZSA9IHRydWU7XG4gICAgcmV0dXJuIHBvcztcbiAgfVxuXG4gIC8vIENvbXB1dGUgdGhlIGNoYXJhY3RlciBwb3NpdGlvbiBjbG9zZXN0IHRvIHRoZSBnaXZlbiBjb29yZGluYXRlcy5cbiAgLy8gSW5wdXQgbXVzdCBiZSBsaW5lU3BhY2UtbG9jYWwgKFwiZGl2XCIgY29vcmRpbmF0ZSBzeXN0ZW0pLlxuICBmdW5jdGlvbiBjb29yZHNDaGFyKGNtLCB4LCB5KSB7XG4gICAgdmFyIGRvYyA9IGNtLmRvYztcbiAgICB5ICs9IGNtLmRpc3BsYXkudmlld09mZnNldDtcbiAgICBpZiAoeSA8IDApIHJldHVybiBQb3NXaXRoSW5mbyhkb2MuZmlyc3QsIDAsIHRydWUsIC0xKTtcbiAgICB2YXIgbGluZU4gPSBsaW5lQXRIZWlnaHQoZG9jLCB5KSwgbGFzdCA9IGRvYy5maXJzdCArIGRvYy5zaXplIC0gMTtcbiAgICBpZiAobGluZU4gPiBsYXN0KVxuICAgICAgcmV0dXJuIFBvc1dpdGhJbmZvKGRvYy5maXJzdCArIGRvYy5zaXplIC0gMSwgZ2V0TGluZShkb2MsIGxhc3QpLnRleHQubGVuZ3RoLCB0cnVlLCAxKTtcbiAgICBpZiAoeCA8IDApIHggPSAwO1xuXG4gICAgdmFyIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgbGluZU4pO1xuICAgIGZvciAoOzspIHtcbiAgICAgIHZhciBmb3VuZCA9IGNvb3Jkc0NoYXJJbm5lcihjbSwgbGluZU9iaiwgbGluZU4sIHgsIHkpO1xuICAgICAgdmFyIG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdEVuZChsaW5lT2JqKTtcbiAgICAgIHZhciBtZXJnZWRQb3MgPSBtZXJnZWQgJiYgbWVyZ2VkLmZpbmQoMCwgdHJ1ZSk7XG4gICAgICBpZiAobWVyZ2VkICYmIChmb3VuZC5jaCA+IG1lcmdlZFBvcy5mcm9tLmNoIHx8IGZvdW5kLmNoID09IG1lcmdlZFBvcy5mcm9tLmNoICYmIGZvdW5kLnhSZWwgPiAwKSlcbiAgICAgICAgbGluZU4gPSBsaW5lTm8obGluZU9iaiA9IG1lcmdlZFBvcy50by5saW5lKTtcbiAgICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIGZvdW5kO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGNvb3Jkc0NoYXJJbm5lcihjbSwgbGluZU9iaiwgbGluZU5vLCB4LCB5KSB7XG4gICAgdmFyIGlubmVyT2ZmID0geSAtIGhlaWdodEF0TGluZShsaW5lT2JqKTtcbiAgICB2YXIgd3JvbmdMaW5lID0gZmFsc2UsIGFkanVzdCA9IDIgKiBjbS5kaXNwbGF5LndyYXBwZXIuY2xpZW50V2lkdGg7XG4gICAgdmFyIHByZXBhcmVkTWVhc3VyZSA9IHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZU9iaik7XG5cbiAgICBmdW5jdGlvbiBnZXRYKGNoKSB7XG4gICAgICB2YXIgc3AgPSBjdXJzb3JDb29yZHMoY20sIFBvcyhsaW5lTm8sIGNoKSwgXCJsaW5lXCIsIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSk7XG4gICAgICB3cm9uZ0xpbmUgPSB0cnVlO1xuICAgICAgaWYgKGlubmVyT2ZmID4gc3AuYm90dG9tKSByZXR1cm4gc3AubGVmdCAtIGFkanVzdDtcbiAgICAgIGVsc2UgaWYgKGlubmVyT2ZmIDwgc3AudG9wKSByZXR1cm4gc3AubGVmdCArIGFkanVzdDtcbiAgICAgIGVsc2Ugd3JvbmdMaW5lID0gZmFsc2U7XG4gICAgICByZXR1cm4gc3AubGVmdDtcbiAgICB9XG5cbiAgICB2YXIgYmlkaSA9IGdldE9yZGVyKGxpbmVPYmopLCBkaXN0ID0gbGluZU9iai50ZXh0Lmxlbmd0aDtcbiAgICB2YXIgZnJvbSA9IGxpbmVMZWZ0KGxpbmVPYmopLCB0byA9IGxpbmVSaWdodChsaW5lT2JqKTtcbiAgICB2YXIgZnJvbVggPSBnZXRYKGZyb20pLCBmcm9tT3V0c2lkZSA9IHdyb25nTGluZSwgdG9YID0gZ2V0WCh0byksIHRvT3V0c2lkZSA9IHdyb25nTGluZTtcblxuICAgIGlmICh4ID4gdG9YKSByZXR1cm4gUG9zV2l0aEluZm8obGluZU5vLCB0bywgdG9PdXRzaWRlLCAxKTtcbiAgICAvLyBEbyBhIGJpbmFyeSBzZWFyY2ggYmV0d2VlbiB0aGVzZSBib3VuZHMuXG4gICAgZm9yICg7Oykge1xuICAgICAgaWYgKGJpZGkgPyB0byA9PSBmcm9tIHx8IHRvID09IG1vdmVWaXN1YWxseShsaW5lT2JqLCBmcm9tLCAxKSA6IHRvIC0gZnJvbSA8PSAxKSB7XG4gICAgICAgIHZhciBjaCA9IHggPCBmcm9tWCB8fCB4IC0gZnJvbVggPD0gdG9YIC0geCA/IGZyb20gOiB0bztcbiAgICAgICAgdmFyIHhEaWZmID0geCAtIChjaCA9PSBmcm9tID8gZnJvbVggOiB0b1gpO1xuICAgICAgICB3aGlsZSAoaXNFeHRlbmRpbmdDaGFyKGxpbmVPYmoudGV4dC5jaGFyQXQoY2gpKSkgKytjaDtcbiAgICAgICAgdmFyIHBvcyA9IFBvc1dpdGhJbmZvKGxpbmVObywgY2gsIGNoID09IGZyb20gPyBmcm9tT3V0c2lkZSA6IHRvT3V0c2lkZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHhEaWZmIDwgLTEgPyAtMSA6IHhEaWZmID4gMSA/IDEgOiAwKTtcbiAgICAgICAgcmV0dXJuIHBvcztcbiAgICAgIH1cbiAgICAgIHZhciBzdGVwID0gTWF0aC5jZWlsKGRpc3QgLyAyKSwgbWlkZGxlID0gZnJvbSArIHN0ZXA7XG4gICAgICBpZiAoYmlkaSkge1xuICAgICAgICBtaWRkbGUgPSBmcm9tO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ZXA7ICsraSkgbWlkZGxlID0gbW92ZVZpc3VhbGx5KGxpbmVPYmosIG1pZGRsZSwgMSk7XG4gICAgICB9XG4gICAgICB2YXIgbWlkZGxlWCA9IGdldFgobWlkZGxlKTtcbiAgICAgIGlmIChtaWRkbGVYID4geCkge3RvID0gbWlkZGxlOyB0b1ggPSBtaWRkbGVYOyBpZiAodG9PdXRzaWRlID0gd3JvbmdMaW5lKSB0b1ggKz0gMTAwMDsgZGlzdCA9IHN0ZXA7fVxuICAgICAgZWxzZSB7ZnJvbSA9IG1pZGRsZTsgZnJvbVggPSBtaWRkbGVYOyBmcm9tT3V0c2lkZSA9IHdyb25nTGluZTsgZGlzdCAtPSBzdGVwO31cbiAgICB9XG4gIH1cblxuICB2YXIgbWVhc3VyZVRleHQ7XG4gIC8vIENvbXB1dGUgdGhlIGRlZmF1bHQgdGV4dCBoZWlnaHQuXG4gIGZ1bmN0aW9uIHRleHRIZWlnaHQoZGlzcGxheSkge1xuICAgIGlmIChkaXNwbGF5LmNhY2hlZFRleHRIZWlnaHQgIT0gbnVsbCkgcmV0dXJuIGRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodDtcbiAgICBpZiAobWVhc3VyZVRleHQgPT0gbnVsbCkge1xuICAgICAgbWVhc3VyZVRleHQgPSBlbHQoXCJwcmVcIik7XG4gICAgICAvLyBNZWFzdXJlIGEgYnVuY2ggb2YgbGluZXMsIGZvciBicm93c2VycyB0aGF0IGNvbXB1dGVcbiAgICAgIC8vIGZyYWN0aW9uYWwgaGVpZ2h0cy5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNDk7ICsraSkge1xuICAgICAgICBtZWFzdXJlVGV4dC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcInhcIikpO1xuICAgICAgICBtZWFzdXJlVGV4dC5hcHBlbmRDaGlsZChlbHQoXCJiclwiKSk7XG4gICAgICB9XG4gICAgICBtZWFzdXJlVGV4dC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcInhcIikpO1xuICAgIH1cbiAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5Lm1lYXN1cmUsIG1lYXN1cmVUZXh0KTtcbiAgICB2YXIgaGVpZ2h0ID0gbWVhc3VyZVRleHQub2Zmc2V0SGVpZ2h0IC8gNTA7XG4gICAgaWYgKGhlaWdodCA+IDMpIGRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodCA9IGhlaWdodDtcbiAgICByZW1vdmVDaGlsZHJlbihkaXNwbGF5Lm1lYXN1cmUpO1xuICAgIHJldHVybiBoZWlnaHQgfHwgMTtcbiAgfVxuXG4gIC8vIENvbXB1dGUgdGhlIGRlZmF1bHQgY2hhcmFjdGVyIHdpZHRoLlxuICBmdW5jdGlvbiBjaGFyV2lkdGgoZGlzcGxheSkge1xuICAgIGlmIChkaXNwbGF5LmNhY2hlZENoYXJXaWR0aCAhPSBudWxsKSByZXR1cm4gZGlzcGxheS5jYWNoZWRDaGFyV2lkdGg7XG4gICAgdmFyIGFuY2hvciA9IGVsdChcInNwYW5cIiwgXCJ4eHh4eHh4eHh4XCIpO1xuICAgIHZhciBwcmUgPSBlbHQoXCJwcmVcIiwgW2FuY2hvcl0pO1xuICAgIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGRpc3BsYXkubWVhc3VyZSwgcHJlKTtcbiAgICB2YXIgcmVjdCA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgd2lkdGggPSAocmVjdC5yaWdodCAtIHJlY3QubGVmdCkgLyAxMDtcbiAgICBpZiAod2lkdGggPiAyKSBkaXNwbGF5LmNhY2hlZENoYXJXaWR0aCA9IHdpZHRoO1xuICAgIHJldHVybiB3aWR0aCB8fCAxMDtcbiAgfVxuXG4gIC8vIE9QRVJBVElPTlNcblxuICAvLyBPcGVyYXRpb25zIGFyZSB1c2VkIHRvIHdyYXAgYSBzZXJpZXMgb2YgY2hhbmdlcyB0byB0aGUgZWRpdG9yXG4gIC8vIHN0YXRlIGluIHN1Y2ggYSB3YXkgdGhhdCBlYWNoIGNoYW5nZSB3b24ndCBoYXZlIHRvIHVwZGF0ZSB0aGVcbiAgLy8gY3Vyc29yIGFuZCBkaXNwbGF5ICh3aGljaCB3b3VsZCBiZSBhd2t3YXJkLCBzbG93LCBhbmRcbiAgLy8gZXJyb3ItcHJvbmUpLiBJbnN0ZWFkLCBkaXNwbGF5IHVwZGF0ZXMgYXJlIGJhdGNoZWQgYW5kIHRoZW4gYWxsXG4gIC8vIGNvbWJpbmVkIGFuZCBleGVjdXRlZCBhdCBvbmNlLlxuXG4gIHZhciBvcGVyYXRpb25Hcm91cCA9IG51bGw7XG5cbiAgdmFyIG5leHRPcElkID0gMDtcbiAgLy8gU3RhcnQgYSBuZXcgb3BlcmF0aW9uLlxuICBmdW5jdGlvbiBzdGFydE9wZXJhdGlvbihjbSkge1xuICAgIGNtLmN1ck9wID0ge1xuICAgICAgY206IGNtLFxuICAgICAgdmlld0NoYW5nZWQ6IGZhbHNlLCAgICAgIC8vIEZsYWcgdGhhdCBpbmRpY2F0ZXMgdGhhdCBsaW5lcyBtaWdodCBuZWVkIHRvIGJlIHJlZHJhd25cbiAgICAgIHN0YXJ0SGVpZ2h0OiBjbS5kb2MuaGVpZ2h0LCAvLyBVc2VkIHRvIGRldGVjdCBuZWVkIHRvIHVwZGF0ZSBzY3JvbGxiYXJcbiAgICAgIGZvcmNlVXBkYXRlOiBmYWxzZSwgICAgICAvLyBVc2VkIHRvIGZvcmNlIGEgcmVkcmF3XG4gICAgICB1cGRhdGVJbnB1dDogbnVsbCwgICAgICAgLy8gV2hldGhlciB0byByZXNldCB0aGUgaW5wdXQgdGV4dGFyZWFcbiAgICAgIHR5cGluZzogZmFsc2UsICAgICAgICAgICAvLyBXaGV0aGVyIHRoaXMgcmVzZXQgc2hvdWxkIGJlIGNhcmVmdWwgdG8gbGVhdmUgZXhpc3RpbmcgdGV4dCAoZm9yIGNvbXBvc2l0aW5nKVxuICAgICAgY2hhbmdlT2JqczogbnVsbCwgICAgICAgIC8vIEFjY3VtdWxhdGVkIGNoYW5nZXMsIGZvciBmaXJpbmcgY2hhbmdlIGV2ZW50c1xuICAgICAgY3Vyc29yQWN0aXZpdHlIYW5kbGVyczogbnVsbCwgLy8gU2V0IG9mIGhhbmRsZXJzIHRvIGZpcmUgY3Vyc29yQWN0aXZpdHkgb25cbiAgICAgIGN1cnNvckFjdGl2aXR5Q2FsbGVkOiAwLCAvLyBUcmFja3Mgd2hpY2ggY3Vyc29yQWN0aXZpdHkgaGFuZGxlcnMgaGF2ZSBiZWVuIGNhbGxlZCBhbHJlYWR5XG4gICAgICBzZWxlY3Rpb25DaGFuZ2VkOiBmYWxzZSwgLy8gV2hldGhlciB0aGUgc2VsZWN0aW9uIG5lZWRzIHRvIGJlIHJlZHJhd25cbiAgICAgIHVwZGF0ZU1heExpbmU6IGZhbHNlLCAgICAvLyBTZXQgd2hlbiB0aGUgd2lkZXN0IGxpbmUgbmVlZHMgdG8gYmUgZGV0ZXJtaW5lZCBhbmV3XG4gICAgICBzY3JvbGxMZWZ0OiBudWxsLCBzY3JvbGxUb3A6IG51bGwsIC8vIEludGVybWVkaWF0ZSBzY3JvbGwgcG9zaXRpb24sIG5vdCBwdXNoZWQgdG8gRE9NIHlldFxuICAgICAgc2Nyb2xsVG9Qb3M6IG51bGwsICAgICAgIC8vIFVzZWQgdG8gc2Nyb2xsIHRvIGEgc3BlY2lmaWMgcG9zaXRpb25cbiAgICAgIGZvY3VzOiBmYWxzZSxcbiAgICAgIGlkOiArK25leHRPcElkICAgICAgICAgICAvLyBVbmlxdWUgSURcbiAgICB9O1xuICAgIGlmIChvcGVyYXRpb25Hcm91cCkge1xuICAgICAgb3BlcmF0aW9uR3JvdXAub3BzLnB1c2goY20uY3VyT3ApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjbS5jdXJPcC5vd25zR3JvdXAgPSBvcGVyYXRpb25Hcm91cCA9IHtcbiAgICAgICAgb3BzOiBbY20uY3VyT3BdLFxuICAgICAgICBkZWxheWVkQ2FsbGJhY2tzOiBbXVxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBmaXJlQ2FsbGJhY2tzRm9yT3BzKGdyb3VwKSB7XG4gICAgLy8gQ2FsbHMgZGVsYXllZCBjYWxsYmFja3MgYW5kIGN1cnNvckFjdGl2aXR5IGhhbmRsZXJzIHVudGlsIG5vXG4gICAgLy8gbmV3IG9uZXMgYXBwZWFyXG4gICAgdmFyIGNhbGxiYWNrcyA9IGdyb3VwLmRlbGF5ZWRDYWxsYmFja3MsIGkgPSAwO1xuICAgIGRvIHtcbiAgICAgIGZvciAoOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKVxuICAgICAgICBjYWxsYmFja3NbaV0uY2FsbChudWxsKTtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZ3JvdXAub3BzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHZhciBvcCA9IGdyb3VwLm9wc1tqXTtcbiAgICAgICAgaWYgKG9wLmN1cnNvckFjdGl2aXR5SGFuZGxlcnMpXG4gICAgICAgICAgd2hpbGUgKG9wLmN1cnNvckFjdGl2aXR5Q2FsbGVkIDwgb3AuY3Vyc29yQWN0aXZpdHlIYW5kbGVycy5sZW5ndGgpXG4gICAgICAgICAgICBvcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzW29wLmN1cnNvckFjdGl2aXR5Q2FsbGVkKytdLmNhbGwobnVsbCwgb3AuY20pO1xuICAgICAgfVxuICAgIH0gd2hpbGUgKGkgPCBjYWxsYmFja3MubGVuZ3RoKTtcbiAgfVxuXG4gIC8vIEZpbmlzaCBhbiBvcGVyYXRpb24sIHVwZGF0aW5nIHRoZSBkaXNwbGF5IGFuZCBzaWduYWxsaW5nIGRlbGF5ZWQgZXZlbnRzXG4gIGZ1bmN0aW9uIGVuZE9wZXJhdGlvbihjbSkge1xuICAgIHZhciBvcCA9IGNtLmN1ck9wLCBncm91cCA9IG9wLm93bnNHcm91cDtcbiAgICBpZiAoIWdyb3VwKSByZXR1cm47XG5cbiAgICB0cnkgeyBmaXJlQ2FsbGJhY2tzRm9yT3BzKGdyb3VwKTsgfVxuICAgIGZpbmFsbHkge1xuICAgICAgb3BlcmF0aW9uR3JvdXAgPSBudWxsO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBncm91cC5vcHMubGVuZ3RoOyBpKyspXG4gICAgICAgIGdyb3VwLm9wc1tpXS5jbS5jdXJPcCA9IG51bGw7XG4gICAgICBlbmRPcGVyYXRpb25zKGdyb3VwKTtcbiAgICB9XG4gIH1cblxuICAvLyBUaGUgRE9NIHVwZGF0ZXMgZG9uZSB3aGVuIGFuIG9wZXJhdGlvbiBmaW5pc2hlcyBhcmUgYmF0Y2hlZCBzb1xuICAvLyB0aGF0IHRoZSBtaW5pbXVtIG51bWJlciBvZiByZWxheW91dHMgYXJlIHJlcXVpcmVkLlxuICBmdW5jdGlvbiBlbmRPcGVyYXRpb25zKGdyb3VwKSB7XG4gICAgdmFyIG9wcyA9IGdyb3VwLm9wcztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9wcy5sZW5ndGg7IGkrKykgLy8gUmVhZCBET01cbiAgICAgIGVuZE9wZXJhdGlvbl9SMShvcHNbaV0pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb3BzLmxlbmd0aDsgaSsrKSAvLyBXcml0ZSBET00gKG1heWJlKVxuICAgICAgZW5kT3BlcmF0aW9uX1cxKG9wc1tpXSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcHMubGVuZ3RoOyBpKyspIC8vIFJlYWQgRE9NXG4gICAgICBlbmRPcGVyYXRpb25fUjIob3BzW2ldKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9wcy5sZW5ndGg7IGkrKykgLy8gV3JpdGUgRE9NIChtYXliZSlcbiAgICAgIGVuZE9wZXJhdGlvbl9XMihvcHNbaV0pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb3BzLmxlbmd0aDsgaSsrKSAvLyBSZWFkIERPTVxuICAgICAgZW5kT3BlcmF0aW9uX2ZpbmlzaChvcHNbaV0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kT3BlcmF0aW9uX1IxKG9wKSB7XG4gICAgdmFyIGNtID0gb3AuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICAgIG1heWJlQ2xpcFNjcm9sbGJhcnMoY20pO1xuICAgIGlmIChvcC51cGRhdGVNYXhMaW5lKSBmaW5kTWF4TGluZShjbSk7XG5cbiAgICBvcC5tdXN0VXBkYXRlID0gb3Audmlld0NoYW5nZWQgfHwgb3AuZm9yY2VVcGRhdGUgfHwgb3Auc2Nyb2xsVG9wICE9IG51bGwgfHxcbiAgICAgIG9wLnNjcm9sbFRvUG9zICYmIChvcC5zY3JvbGxUb1Bvcy5mcm9tLmxpbmUgPCBkaXNwbGF5LnZpZXdGcm9tIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgb3Auc2Nyb2xsVG9Qb3MudG8ubGluZSA+PSBkaXNwbGF5LnZpZXdUbykgfHxcbiAgICAgIGRpc3BsYXkubWF4TGluZUNoYW5nZWQgJiYgY20ub3B0aW9ucy5saW5lV3JhcHBpbmc7XG4gICAgb3AudXBkYXRlID0gb3AubXVzdFVwZGF0ZSAmJlxuICAgICAgbmV3IERpc3BsYXlVcGRhdGUoY20sIG9wLm11c3RVcGRhdGUgJiYge3RvcDogb3Auc2Nyb2xsVG9wLCBlbnN1cmU6IG9wLnNjcm9sbFRvUG9zfSwgb3AuZm9yY2VVcGRhdGUpO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kT3BlcmF0aW9uX1cxKG9wKSB7XG4gICAgb3AudXBkYXRlZERpc3BsYXkgPSBvcC5tdXN0VXBkYXRlICYmIHVwZGF0ZURpc3BsYXlJZk5lZWRlZChvcC5jbSwgb3AudXBkYXRlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZE9wZXJhdGlvbl9SMihvcCkge1xuICAgIHZhciBjbSA9IG9wLmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgICBpZiAob3AudXBkYXRlZERpc3BsYXkpIHVwZGF0ZUhlaWdodHNJblZpZXdwb3J0KGNtKTtcblxuICAgIG9wLmJhck1lYXN1cmUgPSBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSk7XG5cbiAgICAvLyBJZiB0aGUgbWF4IGxpbmUgY2hhbmdlZCBzaW5jZSBpdCB3YXMgbGFzdCBtZWFzdXJlZCwgbWVhc3VyZSBpdCxcbiAgICAvLyBhbmQgZW5zdXJlIHRoZSBkb2N1bWVudCdzIHdpZHRoIG1hdGNoZXMgaXQuXG4gICAgLy8gdXBkYXRlRGlzcGxheV9XMiB3aWxsIHVzZSB0aGVzZSBwcm9wZXJ0aWVzIHRvIGRvIHRoZSBhY3R1YWwgcmVzaXppbmdcbiAgICBpZiAoZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCAmJiAhY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICAgIG9wLmFkanVzdFdpZHRoVG8gPSBtZWFzdXJlQ2hhcihjbSwgZGlzcGxheS5tYXhMaW5lLCBkaXNwbGF5Lm1heExpbmUudGV4dC5sZW5ndGgpLmxlZnQgKyAzO1xuICAgICAgY20uZGlzcGxheS5zaXplcldpZHRoID0gb3AuYWRqdXN0V2lkdGhUbztcbiAgICAgIG9wLmJhck1lYXN1cmUuc2Nyb2xsV2lkdGggPVxuICAgICAgICBNYXRoLm1heChkaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoLCBkaXNwbGF5LnNpemVyLm9mZnNldExlZnQgKyBvcC5hZGp1c3RXaWR0aFRvICsgc2Nyb2xsR2FwKGNtKSArIGNtLmRpc3BsYXkuYmFyV2lkdGgpO1xuICAgICAgb3AubWF4U2Nyb2xsTGVmdCA9IE1hdGgubWF4KDAsIGRpc3BsYXkuc2l6ZXIub2Zmc2V0TGVmdCArIG9wLmFkanVzdFdpZHRoVG8gLSBkaXNwbGF5V2lkdGgoY20pKTtcbiAgICB9XG5cbiAgICBpZiAob3AudXBkYXRlZERpc3BsYXkgfHwgb3Auc2VsZWN0aW9uQ2hhbmdlZClcbiAgICAgIG9wLnByZXBhcmVkU2VsZWN0aW9uID0gZGlzcGxheS5pbnB1dC5wcmVwYXJlU2VsZWN0aW9uKCk7XG4gIH1cblxuICBmdW5jdGlvbiBlbmRPcGVyYXRpb25fVzIob3ApIHtcbiAgICB2YXIgY20gPSBvcC5jbTtcblxuICAgIGlmIChvcC5hZGp1c3RXaWR0aFRvICE9IG51bGwpIHtcbiAgICAgIGNtLmRpc3BsYXkuc2l6ZXIuc3R5bGUubWluV2lkdGggPSBvcC5hZGp1c3RXaWR0aFRvICsgXCJweFwiO1xuICAgICAgaWYgKG9wLm1heFNjcm9sbExlZnQgPCBjbS5kb2Muc2Nyb2xsTGVmdClcbiAgICAgICAgc2V0U2Nyb2xsTGVmdChjbSwgTWF0aC5taW4oY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0LCBvcC5tYXhTY3JvbGxMZWZ0KSwgdHJ1ZSk7XG4gICAgICBjbS5kaXNwbGF5Lm1heExpbmVDaGFuZ2VkID0gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKG9wLnByZXBhcmVkU2VsZWN0aW9uKVxuICAgICAgY20uZGlzcGxheS5pbnB1dC5zaG93U2VsZWN0aW9uKG9wLnByZXBhcmVkU2VsZWN0aW9uKTtcbiAgICBpZiAob3AudXBkYXRlZERpc3BsYXkpXG4gICAgICBzZXREb2N1bWVudEhlaWdodChjbSwgb3AuYmFyTWVhc3VyZSk7XG4gICAgaWYgKG9wLnVwZGF0ZWREaXNwbGF5IHx8IG9wLnN0YXJ0SGVpZ2h0ICE9IGNtLmRvYy5oZWlnaHQpXG4gICAgICB1cGRhdGVTY3JvbGxiYXJzKGNtLCBvcC5iYXJNZWFzdXJlKTtcblxuICAgIGlmIChvcC5zZWxlY3Rpb25DaGFuZ2VkKSByZXN0YXJ0QmxpbmsoY20pO1xuXG4gICAgaWYgKGNtLnN0YXRlLmZvY3VzZWQgJiYgb3AudXBkYXRlSW5wdXQpXG4gICAgICBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KG9wLnR5cGluZyk7XG4gICAgaWYgKG9wLmZvY3VzICYmIG9wLmZvY3VzID09IGFjdGl2ZUVsdCgpICYmICghZG9jdW1lbnQuaGFzRm9jdXMgfHwgZG9jdW1lbnQuaGFzRm9jdXMoKSkpXG4gICAgICBlbnN1cmVGb2N1cyhvcC5jbSk7XG4gIH1cblxuICBmdW5jdGlvbiBlbmRPcGVyYXRpb25fZmluaXNoKG9wKSB7XG4gICAgdmFyIGNtID0gb3AuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG5cbiAgICBpZiAob3AudXBkYXRlZERpc3BsYXkpIHBvc3RVcGRhdGVEaXNwbGF5KGNtLCBvcC51cGRhdGUpO1xuXG4gICAgLy8gQWJvcnQgbW91c2Ugd2hlZWwgZGVsdGEgbWVhc3VyZW1lbnQsIHdoZW4gc2Nyb2xsaW5nIGV4cGxpY2l0bHlcbiAgICBpZiAoZGlzcGxheS53aGVlbFN0YXJ0WCAhPSBudWxsICYmIChvcC5zY3JvbGxUb3AgIT0gbnVsbCB8fCBvcC5zY3JvbGxMZWZ0ICE9IG51bGwgfHwgb3Auc2Nyb2xsVG9Qb3MpKVxuICAgICAgZGlzcGxheS53aGVlbFN0YXJ0WCA9IGRpc3BsYXkud2hlZWxTdGFydFkgPSBudWxsO1xuXG4gICAgLy8gUHJvcGFnYXRlIHRoZSBzY3JvbGwgcG9zaXRpb24gdG8gdGhlIGFjdHVhbCBET00gc2Nyb2xsZXJcbiAgICBpZiAob3Auc2Nyb2xsVG9wICE9IG51bGwgJiYgKGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wICE9IG9wLnNjcm9sbFRvcCB8fCBvcC5mb3JjZVNjcm9sbCkpIHtcbiAgICAgIGRvYy5zY3JvbGxUb3AgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbEhlaWdodCAtIGRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50SGVpZ2h0LCBvcC5zY3JvbGxUb3ApKTtcbiAgICAgIGRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxUb3AoZG9jLnNjcm9sbFRvcCk7XG4gICAgICBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcCA9IGRvYy5zY3JvbGxUb3A7XG4gICAgfVxuICAgIGlmIChvcC5zY3JvbGxMZWZ0ICE9IG51bGwgJiYgKGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCAhPSBvcC5zY3JvbGxMZWZ0IHx8IG9wLmZvcmNlU2Nyb2xsKSkge1xuICAgICAgZG9jLnNjcm9sbExlZnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFdpZHRoIC0gZGlzcGxheVdpZHRoKGNtKSwgb3Auc2Nyb2xsTGVmdCkpO1xuICAgICAgZGlzcGxheS5zY3JvbGxiYXJzLnNldFNjcm9sbExlZnQoZG9jLnNjcm9sbExlZnQpO1xuICAgICAgZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0ID0gZG9jLnNjcm9sbExlZnQ7XG4gICAgICBhbGlnbkhvcml6b250YWxseShjbSk7XG4gICAgfVxuICAgIC8vIElmIHdlIG5lZWQgdG8gc2Nyb2xsIGEgc3BlY2lmaWMgcG9zaXRpb24gaW50byB2aWV3LCBkbyBzby5cbiAgICBpZiAob3Auc2Nyb2xsVG9Qb3MpIHtcbiAgICAgIHZhciBjb29yZHMgPSBzY3JvbGxQb3NJbnRvVmlldyhjbSwgY2xpcFBvcyhkb2MsIG9wLnNjcm9sbFRvUG9zLmZyb20pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsaXBQb3MoZG9jLCBvcC5zY3JvbGxUb1Bvcy50byksIG9wLnNjcm9sbFRvUG9zLm1hcmdpbik7XG4gICAgICBpZiAob3Auc2Nyb2xsVG9Qb3MuaXNDdXJzb3IgJiYgY20uc3RhdGUuZm9jdXNlZCkgbWF5YmVTY3JvbGxXaW5kb3coY20sIGNvb3Jkcyk7XG4gICAgfVxuXG4gICAgLy8gRmlyZSBldmVudHMgZm9yIG1hcmtlcnMgdGhhdCBhcmUgaGlkZGVuL3VuaWRkZW4gYnkgZWRpdGluZyBvclxuICAgIC8vIHVuZG9pbmdcbiAgICB2YXIgaGlkZGVuID0gb3AubWF5YmVIaWRkZW5NYXJrZXJzLCB1bmhpZGRlbiA9IG9wLm1heWJlVW5oaWRkZW5NYXJrZXJzO1xuICAgIGlmIChoaWRkZW4pIGZvciAodmFyIGkgPSAwOyBpIDwgaGlkZGVuLmxlbmd0aDsgKytpKVxuICAgICAgaWYgKCFoaWRkZW5baV0ubGluZXMubGVuZ3RoKSBzaWduYWwoaGlkZGVuW2ldLCBcImhpZGVcIik7XG4gICAgaWYgKHVuaGlkZGVuKSBmb3IgKHZhciBpID0gMDsgaSA8IHVuaGlkZGVuLmxlbmd0aDsgKytpKVxuICAgICAgaWYgKHVuaGlkZGVuW2ldLmxpbmVzLmxlbmd0aCkgc2lnbmFsKHVuaGlkZGVuW2ldLCBcInVuaGlkZVwiKTtcblxuICAgIGlmIChkaXNwbGF5LndyYXBwZXIub2Zmc2V0SGVpZ2h0KVxuICAgICAgZG9jLnNjcm9sbFRvcCA9IGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wO1xuXG4gICAgLy8gRmlyZSBjaGFuZ2UgZXZlbnRzLCBhbmQgZGVsYXllZCBldmVudCBoYW5kbGVyc1xuICAgIGlmIChvcC5jaGFuZ2VPYmpzKVxuICAgICAgc2lnbmFsKGNtLCBcImNoYW5nZXNcIiwgY20sIG9wLmNoYW5nZU9ianMpO1xuICAgIGlmIChvcC51cGRhdGUpXG4gICAgICBvcC51cGRhdGUuZmluaXNoKCk7XG4gIH1cblxuICAvLyBSdW4gdGhlIGdpdmVuIGZ1bmN0aW9uIGluIGFuIG9wZXJhdGlvblxuICBmdW5jdGlvbiBydW5Jbk9wKGNtLCBmKSB7XG4gICAgaWYgKGNtLmN1ck9wKSByZXR1cm4gZigpO1xuICAgIHN0YXJ0T3BlcmF0aW9uKGNtKTtcbiAgICB0cnkgeyByZXR1cm4gZigpOyB9XG4gICAgZmluYWxseSB7IGVuZE9wZXJhdGlvbihjbSk7IH1cbiAgfVxuICAvLyBXcmFwcyBhIGZ1bmN0aW9uIGluIGFuIG9wZXJhdGlvbi4gUmV0dXJucyB0aGUgd3JhcHBlZCBmdW5jdGlvbi5cbiAgZnVuY3Rpb24gb3BlcmF0aW9uKGNtLCBmKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKGNtLmN1ck9wKSByZXR1cm4gZi5hcHBseShjbSwgYXJndW1lbnRzKTtcbiAgICAgIHN0YXJ0T3BlcmF0aW9uKGNtKTtcbiAgICAgIHRyeSB7IHJldHVybiBmLmFwcGx5KGNtLCBhcmd1bWVudHMpOyB9XG4gICAgICBmaW5hbGx5IHsgZW5kT3BlcmF0aW9uKGNtKTsgfVxuICAgIH07XG4gIH1cbiAgLy8gVXNlZCB0byBhZGQgbWV0aG9kcyB0byBlZGl0b3IgYW5kIGRvYyBpbnN0YW5jZXMsIHdyYXBwaW5nIHRoZW0gaW5cbiAgLy8gb3BlcmF0aW9ucy5cbiAgZnVuY3Rpb24gbWV0aG9kT3AoZikge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICh0aGlzLmN1ck9wKSByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgc3RhcnRPcGVyYXRpb24odGhpcyk7XG4gICAgICB0cnkgeyByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgICBmaW5hbGx5IHsgZW5kT3BlcmF0aW9uKHRoaXMpOyB9XG4gICAgfTtcbiAgfVxuICBmdW5jdGlvbiBkb2NNZXRob2RPcChmKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGNtID0gdGhpcy5jbTtcbiAgICAgIGlmICghY20gfHwgY20uY3VyT3ApIHJldHVybiBmLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBzdGFydE9wZXJhdGlvbihjbSk7XG4gICAgICB0cnkgeyByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9XG4gICAgICBmaW5hbGx5IHsgZW5kT3BlcmF0aW9uKGNtKTsgfVxuICAgIH07XG4gIH1cblxuICAvLyBWSUVXIFRSQUNLSU5HXG5cbiAgLy8gVGhlc2Ugb2JqZWN0cyBhcmUgdXNlZCB0byByZXByZXNlbnQgdGhlIHZpc2libGUgKGN1cnJlbnRseSBkcmF3bilcbiAgLy8gcGFydCBvZiB0aGUgZG9jdW1lbnQuIEEgTGluZVZpZXcgbWF5IGNvcnJlc3BvbmQgdG8gbXVsdGlwbGVcbiAgLy8gbG9naWNhbCBsaW5lcywgaWYgdGhvc2UgYXJlIGNvbm5lY3RlZCBieSBjb2xsYXBzZWQgcmFuZ2VzLlxuICBmdW5jdGlvbiBMaW5lVmlldyhkb2MsIGxpbmUsIGxpbmVOKSB7XG4gICAgLy8gVGhlIHN0YXJ0aW5nIGxpbmVcbiAgICB0aGlzLmxpbmUgPSBsaW5lO1xuICAgIC8vIENvbnRpbnVpbmcgbGluZXMsIGlmIGFueVxuICAgIHRoaXMucmVzdCA9IHZpc3VhbExpbmVDb250aW51ZWQobGluZSk7XG4gICAgLy8gTnVtYmVyIG9mIGxvZ2ljYWwgbGluZXMgaW4gdGhpcyB2aXN1YWwgbGluZVxuICAgIHRoaXMuc2l6ZSA9IHRoaXMucmVzdCA/IGxpbmVObyhsc3QodGhpcy5yZXN0KSkgLSBsaW5lTiArIDEgOiAxO1xuICAgIHRoaXMubm9kZSA9IHRoaXMudGV4dCA9IG51bGw7XG4gICAgdGhpcy5oaWRkZW4gPSBsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHJhbmdlIG9mIExpbmVWaWV3IG9iamVjdHMgZm9yIHRoZSBnaXZlbiBsaW5lcy5cbiAgZnVuY3Rpb24gYnVpbGRWaWV3QXJyYXkoY20sIGZyb20sIHRvKSB7XG4gICAgdmFyIGFycmF5ID0gW10sIG5leHRQb3M7XG4gICAgZm9yICh2YXIgcG9zID0gZnJvbTsgcG9zIDwgdG87IHBvcyA9IG5leHRQb3MpIHtcbiAgICAgIHZhciB2aWV3ID0gbmV3IExpbmVWaWV3KGNtLmRvYywgZ2V0TGluZShjbS5kb2MsIHBvcyksIHBvcyk7XG4gICAgICBuZXh0UG9zID0gcG9zICsgdmlldy5zaXplO1xuICAgICAgYXJyYXkucHVzaCh2aWV3KTtcbiAgICB9XG4gICAgcmV0dXJuIGFycmF5O1xuICB9XG5cbiAgLy8gVXBkYXRlcyB0aGUgZGlzcGxheS52aWV3IGRhdGEgc3RydWN0dXJlIGZvciBhIGdpdmVuIGNoYW5nZSB0byB0aGVcbiAgLy8gZG9jdW1lbnQuIEZyb20gYW5kIHRvIGFyZSBpbiBwcmUtY2hhbmdlIGNvb3JkaW5hdGVzLiBMZW5kaWZmIGlzXG4gIC8vIHRoZSBhbW91bnQgb2YgbGluZXMgYWRkZWQgb3Igc3VidHJhY3RlZCBieSB0aGUgY2hhbmdlLiBUaGlzIGlzXG4gIC8vIHVzZWQgZm9yIGNoYW5nZXMgdGhhdCBzcGFuIG11bHRpcGxlIGxpbmVzLCBvciBjaGFuZ2UgdGhlIHdheVxuICAvLyBsaW5lcyBhcmUgZGl2aWRlZCBpbnRvIHZpc3VhbCBsaW5lcy4gcmVnTGluZUNoYW5nZSAoYmVsb3cpXG4gIC8vIHJlZ2lzdGVycyBzaW5nbGUtbGluZSBjaGFuZ2VzLlxuICBmdW5jdGlvbiByZWdDaGFuZ2UoY20sIGZyb20sIHRvLCBsZW5kaWZmKSB7XG4gICAgaWYgKGZyb20gPT0gbnVsbCkgZnJvbSA9IGNtLmRvYy5maXJzdDtcbiAgICBpZiAodG8gPT0gbnVsbCkgdG8gPSBjbS5kb2MuZmlyc3QgKyBjbS5kb2Muc2l6ZTtcbiAgICBpZiAoIWxlbmRpZmYpIGxlbmRpZmYgPSAwO1xuXG4gICAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICAgIGlmIChsZW5kaWZmICYmIHRvIDwgZGlzcGxheS52aWV3VG8gJiZcbiAgICAgICAgKGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPT0gbnVsbCB8fCBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID4gZnJvbSkpXG4gICAgICBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID0gZnJvbTtcblxuICAgIGNtLmN1ck9wLnZpZXdDaGFuZ2VkID0gdHJ1ZTtcblxuICAgIGlmIChmcm9tID49IGRpc3BsYXkudmlld1RvKSB7IC8vIENoYW5nZSBhZnRlclxuICAgICAgaWYgKHNhd0NvbGxhcHNlZFNwYW5zICYmIHZpc3VhbExpbmVObyhjbS5kb2MsIGZyb20pIDwgZGlzcGxheS52aWV3VG8pXG4gICAgICAgIHJlc2V0VmlldyhjbSk7XG4gICAgfSBlbHNlIGlmICh0byA8PSBkaXNwbGF5LnZpZXdGcm9tKSB7IC8vIENoYW5nZSBiZWZvcmVcbiAgICAgIGlmIChzYXdDb2xsYXBzZWRTcGFucyAmJiB2aXN1YWxMaW5lRW5kTm8oY20uZG9jLCB0byArIGxlbmRpZmYpID4gZGlzcGxheS52aWV3RnJvbSkge1xuICAgICAgICByZXNldFZpZXcoY20pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGlzcGxheS52aWV3RnJvbSArPSBsZW5kaWZmO1xuICAgICAgICBkaXNwbGF5LnZpZXdUbyArPSBsZW5kaWZmO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZnJvbSA8PSBkaXNwbGF5LnZpZXdGcm9tICYmIHRvID49IGRpc3BsYXkudmlld1RvKSB7IC8vIEZ1bGwgb3ZlcmxhcFxuICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICB9IGVsc2UgaWYgKGZyb20gPD0gZGlzcGxheS52aWV3RnJvbSkgeyAvLyBUb3Agb3ZlcmxhcFxuICAgICAgdmFyIGN1dCA9IHZpZXdDdXR0aW5nUG9pbnQoY20sIHRvLCB0byArIGxlbmRpZmYsIDEpO1xuICAgICAgaWYgKGN1dCkge1xuICAgICAgICBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoY3V0LmluZGV4KTtcbiAgICAgICAgZGlzcGxheS52aWV3RnJvbSA9IGN1dC5saW5lTjtcbiAgICAgICAgZGlzcGxheS52aWV3VG8gKz0gbGVuZGlmZjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc2V0VmlldyhjbSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0byA+PSBkaXNwbGF5LnZpZXdUbykgeyAvLyBCb3R0b20gb3ZlcmxhcFxuICAgICAgdmFyIGN1dCA9IHZpZXdDdXR0aW5nUG9pbnQoY20sIGZyb20sIGZyb20sIC0xKTtcbiAgICAgIGlmIChjdXQpIHtcbiAgICAgICAgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LnNsaWNlKDAsIGN1dC5pbmRleCk7XG4gICAgICAgIGRpc3BsYXkudmlld1RvID0gY3V0LmxpbmVOO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgeyAvLyBHYXAgaW4gdGhlIG1pZGRsZVxuICAgICAgdmFyIGN1dFRvcCA9IHZpZXdDdXR0aW5nUG9pbnQoY20sIGZyb20sIGZyb20sIC0xKTtcbiAgICAgIHZhciBjdXRCb3QgPSB2aWV3Q3V0dGluZ1BvaW50KGNtLCB0bywgdG8gKyBsZW5kaWZmLCAxKTtcbiAgICAgIGlmIChjdXRUb3AgJiYgY3V0Qm90KSB7XG4gICAgICAgIGRpc3BsYXkudmlldyA9IGRpc3BsYXkudmlldy5zbGljZSgwLCBjdXRUb3AuaW5kZXgpXG4gICAgICAgICAgLmNvbmNhdChidWlsZFZpZXdBcnJheShjbSwgY3V0VG9wLmxpbmVOLCBjdXRCb3QubGluZU4pKVxuICAgICAgICAgIC5jb25jYXQoZGlzcGxheS52aWV3LnNsaWNlKGN1dEJvdC5pbmRleCkpO1xuICAgICAgICBkaXNwbGF5LnZpZXdUbyArPSBsZW5kaWZmO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgZXh0ID0gZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkO1xuICAgIGlmIChleHQpIHtcbiAgICAgIGlmICh0byA8IGV4dC5saW5lTilcbiAgICAgICAgZXh0LmxpbmVOICs9IGxlbmRpZmY7XG4gICAgICBlbHNlIGlmIChmcm9tIDwgZXh0LmxpbmVOICsgZXh0LnNpemUpXG4gICAgICAgIGRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVnaXN0ZXIgYSBjaGFuZ2UgdG8gYSBzaW5nbGUgbGluZS4gVHlwZSBtdXN0IGJlIG9uZSBvZiBcInRleHRcIixcbiAgLy8gXCJndXR0ZXJcIiwgXCJjbGFzc1wiLCBcIndpZGdldFwiXG4gIGZ1bmN0aW9uIHJlZ0xpbmVDaGFuZ2UoY20sIGxpbmUsIHR5cGUpIHtcbiAgICBjbS5jdXJPcC52aWV3Q2hhbmdlZCA9IHRydWU7XG4gICAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBleHQgPSBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQ7XG4gICAgaWYgKGV4dCAmJiBsaW5lID49IGV4dC5saW5lTiAmJiBsaW5lIDwgZXh0LmxpbmVOICsgZXh0LnNpemUpXG4gICAgICBkaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQgPSBudWxsO1xuXG4gICAgaWYgKGxpbmUgPCBkaXNwbGF5LnZpZXdGcm9tIHx8IGxpbmUgPj0gZGlzcGxheS52aWV3VG8pIHJldHVybjtcbiAgICB2YXIgbGluZVZpZXcgPSBkaXNwbGF5LnZpZXdbZmluZFZpZXdJbmRleChjbSwgbGluZSldO1xuICAgIGlmIChsaW5lVmlldy5ub2RlID09IG51bGwpIHJldHVybjtcbiAgICB2YXIgYXJyID0gbGluZVZpZXcuY2hhbmdlcyB8fCAobGluZVZpZXcuY2hhbmdlcyA9IFtdKTtcbiAgICBpZiAoaW5kZXhPZihhcnIsIHR5cGUpID09IC0xKSBhcnIucHVzaCh0eXBlKTtcbiAgfVxuXG4gIC8vIENsZWFyIHRoZSB2aWV3LlxuICBmdW5jdGlvbiByZXNldFZpZXcoY20pIHtcbiAgICBjbS5kaXNwbGF5LnZpZXdGcm9tID0gY20uZGlzcGxheS52aWV3VG8gPSBjbS5kb2MuZmlyc3Q7XG4gICAgY20uZGlzcGxheS52aWV3ID0gW107XG4gICAgY20uZGlzcGxheS52aWV3T2Zmc2V0ID0gMDtcbiAgfVxuXG4gIC8vIEZpbmQgdGhlIHZpZXcgZWxlbWVudCBjb3JyZXNwb25kaW5nIHRvIGEgZ2l2ZW4gbGluZS4gUmV0dXJuIG51bGxcbiAgLy8gd2hlbiB0aGUgbGluZSBpc24ndCB2aXNpYmxlLlxuICBmdW5jdGlvbiBmaW5kVmlld0luZGV4KGNtLCBuKSB7XG4gICAgaWYgKG4gPj0gY20uZGlzcGxheS52aWV3VG8pIHJldHVybiBudWxsO1xuICAgIG4gLT0gY20uZGlzcGxheS52aWV3RnJvbTtcbiAgICBpZiAobiA8IDApIHJldHVybiBudWxsO1xuICAgIHZhciB2aWV3ID0gY20uZGlzcGxheS52aWV3O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdmlldy5sZW5ndGg7IGkrKykge1xuICAgICAgbiAtPSB2aWV3W2ldLnNpemU7XG4gICAgICBpZiAobiA8IDApIHJldHVybiBpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHZpZXdDdXR0aW5nUG9pbnQoY20sIG9sZE4sIG5ld04sIGRpcikge1xuICAgIHZhciBpbmRleCA9IGZpbmRWaWV3SW5kZXgoY20sIG9sZE4pLCBkaWZmLCB2aWV3ID0gY20uZGlzcGxheS52aWV3O1xuICAgIGlmICghc2F3Q29sbGFwc2VkU3BhbnMgfHwgbmV3TiA9PSBjbS5kb2MuZmlyc3QgKyBjbS5kb2Muc2l6ZSlcbiAgICAgIHJldHVybiB7aW5kZXg6IGluZGV4LCBsaW5lTjogbmV3Tn07XG4gICAgZm9yICh2YXIgaSA9IDAsIG4gPSBjbS5kaXNwbGF5LnZpZXdGcm9tOyBpIDwgaW5kZXg7IGkrKylcbiAgICAgIG4gKz0gdmlld1tpXS5zaXplO1xuICAgIGlmIChuICE9IG9sZE4pIHtcbiAgICAgIGlmIChkaXIgPiAwKSB7XG4gICAgICAgIGlmIChpbmRleCA9PSB2aWV3Lmxlbmd0aCAtIDEpIHJldHVybiBudWxsO1xuICAgICAgICBkaWZmID0gKG4gKyB2aWV3W2luZGV4XS5zaXplKSAtIG9sZE47XG4gICAgICAgIGluZGV4Kys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkaWZmID0gbiAtIG9sZE47XG4gICAgICB9XG4gICAgICBvbGROICs9IGRpZmY7IG5ld04gKz0gZGlmZjtcbiAgICB9XG4gICAgd2hpbGUgKHZpc3VhbExpbmVObyhjbS5kb2MsIG5ld04pICE9IG5ld04pIHtcbiAgICAgIGlmIChpbmRleCA9PSAoZGlyIDwgMCA/IDAgOiB2aWV3Lmxlbmd0aCAtIDEpKSByZXR1cm4gbnVsbDtcbiAgICAgIG5ld04gKz0gZGlyICogdmlld1tpbmRleCAtIChkaXIgPCAwID8gMSA6IDApXS5zaXplO1xuICAgICAgaW5kZXggKz0gZGlyO1xuICAgIH1cbiAgICByZXR1cm4ge2luZGV4OiBpbmRleCwgbGluZU46IG5ld059O1xuICB9XG5cbiAgLy8gRm9yY2UgdGhlIHZpZXcgdG8gY292ZXIgYSBnaXZlbiByYW5nZSwgYWRkaW5nIGVtcHR5IHZpZXcgZWxlbWVudFxuICAvLyBvciBjbGlwcGluZyBvZmYgZXhpc3Rpbmcgb25lcyBhcyBuZWVkZWQuXG4gIGZ1bmN0aW9uIGFkanVzdFZpZXcoY20sIGZyb20sIHRvKSB7XG4gICAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCB2aWV3ID0gZGlzcGxheS52aWV3O1xuICAgIGlmICh2aWV3Lmxlbmd0aCA9PSAwIHx8IGZyb20gPj0gZGlzcGxheS52aWV3VG8gfHwgdG8gPD0gZGlzcGxheS52aWV3RnJvbSkge1xuICAgICAgZGlzcGxheS52aWV3ID0gYnVpbGRWaWV3QXJyYXkoY20sIGZyb20sIHRvKTtcbiAgICAgIGRpc3BsYXkudmlld0Zyb20gPSBmcm9tO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZGlzcGxheS52aWV3RnJvbSA+IGZyb20pXG4gICAgICAgIGRpc3BsYXkudmlldyA9IGJ1aWxkVmlld0FycmF5KGNtLCBmcm9tLCBkaXNwbGF5LnZpZXdGcm9tKS5jb25jYXQoZGlzcGxheS52aWV3KTtcbiAgICAgIGVsc2UgaWYgKGRpc3BsYXkudmlld0Zyb20gPCBmcm9tKVxuICAgICAgICBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoZmluZFZpZXdJbmRleChjbSwgZnJvbSkpO1xuICAgICAgZGlzcGxheS52aWV3RnJvbSA9IGZyb207XG4gICAgICBpZiAoZGlzcGxheS52aWV3VG8gPCB0bylcbiAgICAgICAgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LmNvbmNhdChidWlsZFZpZXdBcnJheShjbSwgZGlzcGxheS52aWV3VG8sIHRvKSk7XG4gICAgICBlbHNlIGlmIChkaXNwbGF5LnZpZXdUbyA+IHRvKVxuICAgICAgICBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoMCwgZmluZFZpZXdJbmRleChjbSwgdG8pKTtcbiAgICB9XG4gICAgZGlzcGxheS52aWV3VG8gPSB0bztcbiAgfVxuXG4gIC8vIENvdW50IHRoZSBudW1iZXIgb2YgbGluZXMgaW4gdGhlIHZpZXcgd2hvc2UgRE9NIHJlcHJlc2VudGF0aW9uIGlzXG4gIC8vIG91dCBvZiBkYXRlIChvciBub25leGlzdGVudCkuXG4gIGZ1bmN0aW9uIGNvdW50RGlydHlWaWV3KGNtKSB7XG4gICAgdmFyIHZpZXcgPSBjbS5kaXNwbGF5LnZpZXcsIGRpcnR5ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBsaW5lVmlldyA9IHZpZXdbaV07XG4gICAgICBpZiAoIWxpbmVWaWV3LmhpZGRlbiAmJiAoIWxpbmVWaWV3Lm5vZGUgfHwgbGluZVZpZXcuY2hhbmdlcykpICsrZGlydHk7XG4gICAgfVxuICAgIHJldHVybiBkaXJ0eTtcbiAgfVxuXG4gIC8vIEVWRU5UIEhBTkRMRVJTXG5cbiAgLy8gQXR0YWNoIHRoZSBuZWNlc3NhcnkgZXZlbnQgaGFuZGxlcnMgd2hlbiBpbml0aWFsaXppbmcgdGhlIGVkaXRvclxuICBmdW5jdGlvbiByZWdpc3RlckV2ZW50SGFuZGxlcnMoY20pIHtcbiAgICB2YXIgZCA9IGNtLmRpc3BsYXk7XG4gICAgb24oZC5zY3JvbGxlciwgXCJtb3VzZWRvd25cIiwgb3BlcmF0aW9uKGNtLCBvbk1vdXNlRG93bikpO1xuICAgIC8vIE9sZGVyIElFJ3Mgd2lsbCBub3QgZmlyZSBhIHNlY29uZCBtb3VzZWRvd24gZm9yIGEgZG91YmxlIGNsaWNrXG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCAxMSlcbiAgICAgIG9uKGQuc2Nyb2xsZXIsIFwiZGJsY2xpY2tcIiwgb3BlcmF0aW9uKGNtLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSkpIHJldHVybjtcbiAgICAgICAgdmFyIHBvcyA9IHBvc0Zyb21Nb3VzZShjbSwgZSk7XG4gICAgICAgIGlmICghcG9zIHx8IGNsaWNrSW5HdXR0ZXIoY20sIGUpIHx8IGV2ZW50SW5XaWRnZXQoY20uZGlzcGxheSwgZSkpIHJldHVybjtcbiAgICAgICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgICAgdmFyIHdvcmQgPSBjbS5maW5kV29yZEF0KHBvcyk7XG4gICAgICAgIGV4dGVuZFNlbGVjdGlvbihjbS5kb2MsIHdvcmQuYW5jaG9yLCB3b3JkLmhlYWQpO1xuICAgICAgfSkpO1xuICAgIGVsc2VcbiAgICAgIG9uKGQuc2Nyb2xsZXIsIFwiZGJsY2xpY2tcIiwgZnVuY3Rpb24oZSkgeyBzaWduYWxET01FdmVudChjbSwgZSkgfHwgZV9wcmV2ZW50RGVmYXVsdChlKTsgfSk7XG4gICAgLy8gU29tZSBicm93c2VycyBmaXJlIGNvbnRleHRtZW51ICphZnRlciogb3BlbmluZyB0aGUgbWVudSwgYXRcbiAgICAvLyB3aGljaCBwb2ludCB3ZSBjYW4ndCBtZXNzIHdpdGggaXQgYW55bW9yZS4gQ29udGV4dCBtZW51IGlzXG4gICAgLy8gaGFuZGxlZCBpbiBvbk1vdXNlRG93biBmb3IgdGhlc2UgYnJvd3NlcnMuXG4gICAgaWYgKCFjYXB0dXJlUmlnaHRDbGljaykgb24oZC5zY3JvbGxlciwgXCJjb250ZXh0bWVudVwiLCBmdW5jdGlvbihlKSB7b25Db250ZXh0TWVudShjbSwgZSk7fSk7XG5cbiAgICAvLyBVc2VkIHRvIHN1cHByZXNzIG1vdXNlIGV2ZW50IGhhbmRsaW5nIHdoZW4gYSB0b3VjaCBoYXBwZW5zXG4gICAgdmFyIHRvdWNoRmluaXNoZWQsIHByZXZUb3VjaCA9IHtlbmQ6IDB9O1xuICAgIGZ1bmN0aW9uIGZpbmlzaFRvdWNoKCkge1xuICAgICAgaWYgKGQuYWN0aXZlVG91Y2gpIHtcbiAgICAgICAgdG91Y2hGaW5pc2hlZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7ZC5hY3RpdmVUb3VjaCA9IG51bGw7fSwgMTAwMCk7XG4gICAgICAgIHByZXZUb3VjaCA9IGQuYWN0aXZlVG91Y2g7XG4gICAgICAgIHByZXZUb3VjaC5lbmQgPSArbmV3IERhdGU7XG4gICAgICB9XG4gICAgfTtcbiAgICBmdW5jdGlvbiBpc01vdXNlTGlrZVRvdWNoRXZlbnQoZSkge1xuICAgICAgaWYgKGUudG91Y2hlcy5sZW5ndGggIT0gMSkgcmV0dXJuIGZhbHNlO1xuICAgICAgdmFyIHRvdWNoID0gZS50b3VjaGVzWzBdO1xuICAgICAgcmV0dXJuIHRvdWNoLnJhZGl1c1ggPD0gMSAmJiB0b3VjaC5yYWRpdXNZIDw9IDE7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGZhckF3YXkodG91Y2gsIG90aGVyKSB7XG4gICAgICBpZiAob3RoZXIubGVmdCA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcbiAgICAgIHZhciBkeCA9IG90aGVyLmxlZnQgLSB0b3VjaC5sZWZ0LCBkeSA9IG90aGVyLnRvcCAtIHRvdWNoLnRvcDtcbiAgICAgIHJldHVybiBkeCAqIGR4ICsgZHkgKiBkeSA+IDIwICogMjA7XG4gICAgfVxuICAgIG9uKGQuc2Nyb2xsZXIsIFwidG91Y2hzdGFydFwiLCBmdW5jdGlvbihlKSB7XG4gICAgICBpZiAoIWlzTW91c2VMaWtlVG91Y2hFdmVudChlKSkge1xuICAgICAgICBjbGVhclRpbWVvdXQodG91Y2hGaW5pc2hlZCk7XG4gICAgICAgIHZhciBub3cgPSArbmV3IERhdGU7XG4gICAgICAgIGQuYWN0aXZlVG91Y2ggPSB7c3RhcnQ6IG5vdywgbW92ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgIHByZXY6IG5vdyAtIHByZXZUb3VjaC5lbmQgPD0gMzAwID8gcHJldlRvdWNoIDogbnVsbH07XG4gICAgICAgIGlmIChlLnRvdWNoZXMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICBkLmFjdGl2ZVRvdWNoLmxlZnQgPSBlLnRvdWNoZXNbMF0ucGFnZVg7XG4gICAgICAgICAgZC5hY3RpdmVUb3VjaC50b3AgPSBlLnRvdWNoZXNbMF0ucGFnZVk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBvbihkLnNjcm9sbGVyLCBcInRvdWNobW92ZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgIGlmIChkLmFjdGl2ZVRvdWNoKSBkLmFjdGl2ZVRvdWNoLm1vdmVkID0gdHJ1ZTtcbiAgICB9KTtcbiAgICBvbihkLnNjcm9sbGVyLCBcInRvdWNoZW5kXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgIHZhciB0b3VjaCA9IGQuYWN0aXZlVG91Y2g7XG4gICAgICBpZiAodG91Y2ggJiYgIWV2ZW50SW5XaWRnZXQoZCwgZSkgJiYgdG91Y2gubGVmdCAhPSBudWxsICYmXG4gICAgICAgICAgIXRvdWNoLm1vdmVkICYmIG5ldyBEYXRlIC0gdG91Y2guc3RhcnQgPCAzMDApIHtcbiAgICAgICAgdmFyIHBvcyA9IGNtLmNvb3Jkc0NoYXIoZC5hY3RpdmVUb3VjaCwgXCJwYWdlXCIpLCByYW5nZTtcbiAgICAgICAgaWYgKCF0b3VjaC5wcmV2IHx8IGZhckF3YXkodG91Y2gsIHRvdWNoLnByZXYpKSAvLyBTaW5nbGUgdGFwXG4gICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zLCBwb3MpO1xuICAgICAgICBlbHNlIGlmICghdG91Y2gucHJldi5wcmV2IHx8IGZhckF3YXkodG91Y2gsIHRvdWNoLnByZXYucHJldikpIC8vIERvdWJsZSB0YXBcbiAgICAgICAgICByYW5nZSA9IGNtLmZpbmRXb3JkQXQocG9zKTtcbiAgICAgICAgZWxzZSAvLyBUcmlwbGUgdGFwXG4gICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoUG9zKHBvcy5saW5lLCAwKSwgY2xpcFBvcyhjbS5kb2MsIFBvcyhwb3MubGluZSArIDEsIDApKSk7XG4gICAgICAgIGNtLnNldFNlbGVjdGlvbihyYW5nZS5hbmNob3IsIHJhbmdlLmhlYWQpO1xuICAgICAgICBjbS5mb2N1cygpO1xuICAgICAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgfVxuICAgICAgZmluaXNoVG91Y2goKTtcbiAgICB9KTtcbiAgICBvbihkLnNjcm9sbGVyLCBcInRvdWNoY2FuY2VsXCIsIGZpbmlzaFRvdWNoKTtcblxuICAgIC8vIFN5bmMgc2Nyb2xsaW5nIGJldHdlZW4gZmFrZSBzY3JvbGxiYXJzIGFuZCByZWFsIHNjcm9sbGFibGVcbiAgICAvLyBhcmVhLCBlbnN1cmUgdmlld3BvcnQgaXMgdXBkYXRlZCB3aGVuIHNjcm9sbGluZy5cbiAgICBvbihkLnNjcm9sbGVyLCBcInNjcm9sbFwiLCBmdW5jdGlvbigpIHtcbiAgICAgIGlmIChkLnNjcm9sbGVyLmNsaWVudEhlaWdodCkge1xuICAgICAgICBzZXRTY3JvbGxUb3AoY20sIGQuc2Nyb2xsZXIuc2Nyb2xsVG9wKTtcbiAgICAgICAgc2V0U2Nyb2xsTGVmdChjbSwgZC5zY3JvbGxlci5zY3JvbGxMZWZ0LCB0cnVlKTtcbiAgICAgICAgc2lnbmFsKGNtLCBcInNjcm9sbFwiLCBjbSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBMaXN0ZW4gdG8gd2hlZWwgZXZlbnRzIGluIG9yZGVyIHRvIHRyeSBhbmQgdXBkYXRlIHRoZSB2aWV3cG9ydCBvbiB0aW1lLlxuICAgIG9uKGQuc2Nyb2xsZXIsIFwibW91c2V3aGVlbFwiLCBmdW5jdGlvbihlKXtvblNjcm9sbFdoZWVsKGNtLCBlKTt9KTtcbiAgICBvbihkLnNjcm9sbGVyLCBcIkRPTU1vdXNlU2Nyb2xsXCIsIGZ1bmN0aW9uKGUpe29uU2Nyb2xsV2hlZWwoY20sIGUpO30pO1xuXG4gICAgLy8gUHJldmVudCB3cmFwcGVyIGZyb20gZXZlciBzY3JvbGxpbmdcbiAgICBvbihkLndyYXBwZXIsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uKCkgeyBkLndyYXBwZXIuc2Nyb2xsVG9wID0gZC53cmFwcGVyLnNjcm9sbExlZnQgPSAwOyB9KTtcblxuICAgIGQuZHJhZ0Z1bmN0aW9ucyA9IHtcbiAgICAgIGVudGVyOiBmdW5jdGlvbihlKSB7aWYgKCFzaWduYWxET01FdmVudChjbSwgZSkpIGVfc3RvcChlKTt9LFxuICAgICAgb3ZlcjogZnVuY3Rpb24oZSkge2lmICghc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IG9uRHJhZ092ZXIoY20sIGUpOyBlX3N0b3AoZSk7IH19LFxuICAgICAgc3RhcnQ6IGZ1bmN0aW9uKGUpe29uRHJhZ1N0YXJ0KGNtLCBlKTt9LFxuICAgICAgZHJvcDogb3BlcmF0aW9uKGNtLCBvbkRyb3ApLFxuICAgICAgbGVhdmU6IGZ1bmN0aW9uKCkge2NsZWFyRHJhZ0N1cnNvcihjbSk7fVxuICAgIH07XG5cbiAgICB2YXIgaW5wID0gZC5pbnB1dC5nZXRGaWVsZCgpO1xuICAgIG9uKGlucCwgXCJrZXl1cFwiLCBmdW5jdGlvbihlKSB7IG9uS2V5VXAuY2FsbChjbSwgZSk7IH0pO1xuICAgIG9uKGlucCwgXCJrZXlkb3duXCIsIG9wZXJhdGlvbihjbSwgb25LZXlEb3duKSk7XG4gICAgb24oaW5wLCBcImtleXByZXNzXCIsIG9wZXJhdGlvbihjbSwgb25LZXlQcmVzcykpO1xuICAgIG9uKGlucCwgXCJmb2N1c1wiLCBiaW5kKG9uRm9jdXMsIGNtKSk7XG4gICAgb24oaW5wLCBcImJsdXJcIiwgYmluZChvbkJsdXIsIGNtKSk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmFnRHJvcENoYW5nZWQoY20sIHZhbHVlLCBvbGQpIHtcbiAgICB2YXIgd2FzT24gPSBvbGQgJiYgb2xkICE9IENvZGVNaXJyb3IuSW5pdDtcbiAgICBpZiAoIXZhbHVlICE9ICF3YXNPbikge1xuICAgICAgdmFyIGZ1bmNzID0gY20uZGlzcGxheS5kcmFnRnVuY3Rpb25zO1xuICAgICAgdmFyIHRvZ2dsZSA9IHZhbHVlID8gb24gOiBvZmY7XG4gICAgICB0b2dnbGUoY20uZGlzcGxheS5zY3JvbGxlciwgXCJkcmFnc3RhcnRcIiwgZnVuY3Muc3RhcnQpO1xuICAgICAgdG9nZ2xlKGNtLmRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ2VudGVyXCIsIGZ1bmNzLmVudGVyKTtcbiAgICAgIHRvZ2dsZShjbS5kaXNwbGF5LnNjcm9sbGVyLCBcImRyYWdvdmVyXCIsIGZ1bmNzLm92ZXIpO1xuICAgICAgdG9nZ2xlKGNtLmRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ2xlYXZlXCIsIGZ1bmNzLmxlYXZlKTtcbiAgICAgIHRvZ2dsZShjbS5kaXNwbGF5LnNjcm9sbGVyLCBcImRyb3BcIiwgZnVuY3MuZHJvcCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQ2FsbGVkIHdoZW4gdGhlIHdpbmRvdyByZXNpemVzXG4gIGZ1bmN0aW9uIG9uUmVzaXplKGNtKSB7XG4gICAgdmFyIGQgPSBjbS5kaXNwbGF5O1xuICAgIGlmIChkLmxhc3RXcmFwSGVpZ2h0ID09IGQud3JhcHBlci5jbGllbnRIZWlnaHQgJiYgZC5sYXN0V3JhcFdpZHRoID09IGQud3JhcHBlci5jbGllbnRXaWR0aClcbiAgICAgIHJldHVybjtcbiAgICAvLyBNaWdodCBiZSBhIHRleHQgc2NhbGluZyBvcGVyYXRpb24sIGNsZWFyIHNpemUgY2FjaGVzLlxuICAgIGQuY2FjaGVkQ2hhcldpZHRoID0gZC5jYWNoZWRUZXh0SGVpZ2h0ID0gZC5jYWNoZWRQYWRkaW5nSCA9IG51bGw7XG4gICAgZC5zY3JvbGxiYXJzQ2xpcHBlZCA9IGZhbHNlO1xuICAgIGNtLnNldFNpemUoKTtcbiAgfVxuXG4gIC8vIE1PVVNFIEVWRU5UU1xuXG4gIC8vIFJldHVybiB0cnVlIHdoZW4gdGhlIGdpdmVuIG1vdXNlIGV2ZW50IGhhcHBlbmVkIGluIGEgd2lkZ2V0XG4gIGZ1bmN0aW9uIGV2ZW50SW5XaWRnZXQoZGlzcGxheSwgZSkge1xuICAgIGZvciAodmFyIG4gPSBlX3RhcmdldChlKTsgbiAhPSBkaXNwbGF5LndyYXBwZXI7IG4gPSBuLnBhcmVudE5vZGUpIHtcbiAgICAgIGlmICghbiB8fCAobi5ub2RlVHlwZSA9PSAxICYmIG4uZ2V0QXR0cmlidXRlKFwiY20taWdub3JlLWV2ZW50c1wiKSA9PSBcInRydWVcIikgfHxcbiAgICAgICAgICAobi5wYXJlbnROb2RlID09IGRpc3BsYXkuc2l6ZXIgJiYgbiAhPSBkaXNwbGF5Lm1vdmVyKSlcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy8gR2l2ZW4gYSBtb3VzZSBldmVudCwgZmluZCB0aGUgY29ycmVzcG9uZGluZyBwb3NpdGlvbi4gSWYgbGliZXJhbFxuICAvLyBpcyBmYWxzZSwgaXQgY2hlY2tzIHdoZXRoZXIgYSBndXR0ZXIgb3Igc2Nyb2xsYmFyIHdhcyBjbGlja2VkLFxuICAvLyBhbmQgcmV0dXJucyBudWxsIGlmIGl0IHdhcy4gZm9yUmVjdCBpcyB1c2VkIGJ5IHJlY3Rhbmd1bGFyXG4gIC8vIHNlbGVjdGlvbnMsIGFuZCB0cmllcyB0byBlc3RpbWF0ZSBhIGNoYXJhY3RlciBwb3NpdGlvbiBldmVuIGZvclxuICAvLyBjb29yZGluYXRlcyBiZXlvbmQgdGhlIHJpZ2h0IG9mIHRoZSB0ZXh0LlxuICBmdW5jdGlvbiBwb3NGcm9tTW91c2UoY20sIGUsIGxpYmVyYWwsIGZvclJlY3QpIHtcbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gICAgaWYgKCFsaWJlcmFsICYmIGVfdGFyZ2V0KGUpLmdldEF0dHJpYnV0ZShcImNtLW5vdC1jb250ZW50XCIpID09IFwidHJ1ZVwiKSByZXR1cm4gbnVsbDtcblxuICAgIHZhciB4LCB5LCBzcGFjZSA9IGRpc3BsYXkubGluZVNwYWNlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIC8vIEZhaWxzIHVucHJlZGljdGFibHkgb24gSUVbNjddIHdoZW4gbW91c2UgaXMgZHJhZ2dlZCBhcm91bmQgcXVpY2tseS5cbiAgICB0cnkgeyB4ID0gZS5jbGllbnRYIC0gc3BhY2UubGVmdDsgeSA9IGUuY2xpZW50WSAtIHNwYWNlLnRvcDsgfVxuICAgIGNhdGNoIChlKSB7IHJldHVybiBudWxsOyB9XG4gICAgdmFyIGNvb3JkcyA9IGNvb3Jkc0NoYXIoY20sIHgsIHkpLCBsaW5lO1xuICAgIGlmIChmb3JSZWN0ICYmIGNvb3Jkcy54UmVsID09IDEgJiYgKGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgY29vcmRzLmxpbmUpLnRleHQpLmxlbmd0aCA9PSBjb29yZHMuY2gpIHtcbiAgICAgIHZhciBjb2xEaWZmID0gY291bnRDb2x1bW4obGluZSwgbGluZS5sZW5ndGgsIGNtLm9wdGlvbnMudGFiU2l6ZSkgLSBsaW5lLmxlbmd0aDtcbiAgICAgIGNvb3JkcyA9IFBvcyhjb29yZHMubGluZSwgTWF0aC5tYXgoMCwgTWF0aC5yb3VuZCgoeCAtIHBhZGRpbmdIKGNtLmRpc3BsYXkpLmxlZnQpIC8gY2hhcldpZHRoKGNtLmRpc3BsYXkpKSAtIGNvbERpZmYpKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvb3JkcztcbiAgfVxuXG4gIC8vIEEgbW91c2UgZG93biBjYW4gYmUgYSBzaW5nbGUgY2xpY2ssIGRvdWJsZSBjbGljaywgdHJpcGxlIGNsaWNrLFxuICAvLyBzdGFydCBvZiBzZWxlY3Rpb24gZHJhZywgc3RhcnQgb2YgdGV4dCBkcmFnLCBuZXcgY3Vyc29yXG4gIC8vIChjdHJsLWNsaWNrKSwgcmVjdGFuZ2xlIGRyYWcgKGFsdC1kcmFnKSwgb3IgeHdpblxuICAvLyBtaWRkbGUtY2xpY2stcGFzdGUuIE9yIGl0IG1pZ2h0IGJlIGEgY2xpY2sgb24gc29tZXRoaW5nIHdlIHNob3VsZFxuICAvLyBub3QgaW50ZXJmZXJlIHdpdGgsIHN1Y2ggYXMgYSBzY3JvbGxiYXIgb3Igd2lkZ2V0LlxuICBmdW5jdGlvbiBvbk1vdXNlRG93bihlKSB7XG4gICAgdmFyIGNtID0gdGhpcywgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gICAgaWYgKGRpc3BsYXkuYWN0aXZlVG91Y2ggJiYgZGlzcGxheS5pbnB1dC5zdXBwb3J0c1RvdWNoKCkgfHwgc2lnbmFsRE9NRXZlbnQoY20sIGUpKSByZXR1cm47XG4gICAgZGlzcGxheS5zaGlmdCA9IGUuc2hpZnRLZXk7XG5cbiAgICBpZiAoZXZlbnRJbldpZGdldChkaXNwbGF5LCBlKSkge1xuICAgICAgaWYgKCF3ZWJraXQpIHtcbiAgICAgICAgLy8gQnJpZWZseSB0dXJuIG9mZiBkcmFnZ2FiaWxpdHksIHRvIGFsbG93IHdpZGdldHMgdG8gZG9cbiAgICAgICAgLy8gbm9ybWFsIGRyYWdnaW5nIHRoaW5ncy5cbiAgICAgICAgZGlzcGxheS5zY3JvbGxlci5kcmFnZ2FibGUgPSBmYWxzZTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe2Rpc3BsYXkuc2Nyb2xsZXIuZHJhZ2dhYmxlID0gdHJ1ZTt9LCAxMDApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoY2xpY2tJbkd1dHRlcihjbSwgZSkpIHJldHVybjtcbiAgICB2YXIgc3RhcnQgPSBwb3NGcm9tTW91c2UoY20sIGUpO1xuICAgIHdpbmRvdy5mb2N1cygpO1xuXG4gICAgc3dpdGNoIChlX2J1dHRvbihlKSkge1xuICAgIGNhc2UgMTpcbiAgICAgIC8vICMzMjYxOiBtYWtlIHN1cmUsIHRoYXQgd2UncmUgbm90IHN0YXJ0aW5nIGEgc2Vjb25kIHNlbGVjdGlvblxuICAgICAgaWYgKGNtLnN0YXRlLnNlbGVjdGluZ1RleHQpXG4gICAgICAgIGNtLnN0YXRlLnNlbGVjdGluZ1RleHQoZSk7XG4gICAgICBlbHNlIGlmIChzdGFydClcbiAgICAgICAgbGVmdEJ1dHRvbkRvd24oY20sIGUsIHN0YXJ0KTtcbiAgICAgIGVsc2UgaWYgKGVfdGFyZ2V0KGUpID09IGRpc3BsYXkuc2Nyb2xsZXIpXG4gICAgICAgIGVfcHJldmVudERlZmF1bHQoZSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDI6XG4gICAgICBpZiAod2Via2l0KSBjbS5zdGF0ZS5sYXN0TWlkZGxlRG93biA9ICtuZXcgRGF0ZTtcbiAgICAgIGlmIChzdGFydCkgZXh0ZW5kU2VsZWN0aW9uKGNtLmRvYywgc3RhcnQpO1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtkaXNwbGF5LmlucHV0LmZvY3VzKCk7fSwgMjApO1xuICAgICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgMzpcbiAgICAgIGlmIChjYXB0dXJlUmlnaHRDbGljaykgb25Db250ZXh0TWVudShjbSwgZSk7XG4gICAgICBlbHNlIGRlbGF5Qmx1ckV2ZW50KGNtKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHZhciBsYXN0Q2xpY2ssIGxhc3REb3VibGVDbGljaztcbiAgZnVuY3Rpb24gbGVmdEJ1dHRvbkRvd24oY20sIGUsIHN0YXJ0KSB7XG4gICAgaWYgKGllKSBzZXRUaW1lb3V0KGJpbmQoZW5zdXJlRm9jdXMsIGNtKSwgMCk7XG4gICAgZWxzZSBjbS5jdXJPcC5mb2N1cyA9IGFjdGl2ZUVsdCgpO1xuXG4gICAgdmFyIG5vdyA9ICtuZXcgRGF0ZSwgdHlwZTtcbiAgICBpZiAobGFzdERvdWJsZUNsaWNrICYmIGxhc3REb3VibGVDbGljay50aW1lID4gbm93IC0gNDAwICYmIGNtcChsYXN0RG91YmxlQ2xpY2sucG9zLCBzdGFydCkgPT0gMCkge1xuICAgICAgdHlwZSA9IFwidHJpcGxlXCI7XG4gICAgfSBlbHNlIGlmIChsYXN0Q2xpY2sgJiYgbGFzdENsaWNrLnRpbWUgPiBub3cgLSA0MDAgJiYgY21wKGxhc3RDbGljay5wb3MsIHN0YXJ0KSA9PSAwKSB7XG4gICAgICB0eXBlID0gXCJkb3VibGVcIjtcbiAgICAgIGxhc3REb3VibGVDbGljayA9IHt0aW1lOiBub3csIHBvczogc3RhcnR9O1xuICAgIH0gZWxzZSB7XG4gICAgICB0eXBlID0gXCJzaW5nbGVcIjtcbiAgICAgIGxhc3RDbGljayA9IHt0aW1lOiBub3csIHBvczogc3RhcnR9O1xuICAgIH1cblxuICAgIHZhciBzZWwgPSBjbS5kb2Muc2VsLCBtb2RpZmllciA9IG1hYyA/IGUubWV0YUtleSA6IGUuY3RybEtleSwgY29udGFpbmVkO1xuICAgIGlmIChjbS5vcHRpb25zLmRyYWdEcm9wICYmIGRyYWdBbmREcm9wICYmICFpc1JlYWRPbmx5KGNtKSAmJlxuICAgICAgICB0eXBlID09IFwic2luZ2xlXCIgJiYgKGNvbnRhaW5lZCA9IHNlbC5jb250YWlucyhzdGFydCkpID4gLTEgJiZcbiAgICAgICAgKGNtcCgoY29udGFpbmVkID0gc2VsLnJhbmdlc1tjb250YWluZWRdKS5mcm9tKCksIHN0YXJ0KSA8IDAgfHwgc3RhcnQueFJlbCA+IDApICYmXG4gICAgICAgIChjbXAoY29udGFpbmVkLnRvKCksIHN0YXJ0KSA+IDAgfHwgc3RhcnQueFJlbCA8IDApKVxuICAgICAgbGVmdEJ1dHRvblN0YXJ0RHJhZyhjbSwgZSwgc3RhcnQsIG1vZGlmaWVyKTtcbiAgICBlbHNlXG4gICAgICBsZWZ0QnV0dG9uU2VsZWN0KGNtLCBlLCBzdGFydCwgdHlwZSwgbW9kaWZpZXIpO1xuICB9XG5cbiAgLy8gU3RhcnQgYSB0ZXh0IGRyYWcuIFdoZW4gaXQgZW5kcywgc2VlIGlmIGFueSBkcmFnZ2luZyBhY3R1YWxseVxuICAvLyBoYXBwZW4sIGFuZCB0cmVhdCBhcyBhIGNsaWNrIGlmIGl0IGRpZG4ndC5cbiAgZnVuY3Rpb24gbGVmdEJ1dHRvblN0YXJ0RHJhZyhjbSwgZSwgc3RhcnQsIG1vZGlmaWVyKSB7XG4gICAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBzdGFydFRpbWUgPSArbmV3IERhdGU7XG4gICAgdmFyIGRyYWdFbmQgPSBvcGVyYXRpb24oY20sIGZ1bmN0aW9uKGUyKSB7XG4gICAgICBpZiAod2Via2l0KSBkaXNwbGF5LnNjcm9sbGVyLmRyYWdnYWJsZSA9IGZhbHNlO1xuICAgICAgY20uc3RhdGUuZHJhZ2dpbmdUZXh0ID0gZmFsc2U7XG4gICAgICBvZmYoZG9jdW1lbnQsIFwibW91c2V1cFwiLCBkcmFnRW5kKTtcbiAgICAgIG9mZihkaXNwbGF5LnNjcm9sbGVyLCBcImRyb3BcIiwgZHJhZ0VuZCk7XG4gICAgICBpZiAoTWF0aC5hYnMoZS5jbGllbnRYIC0gZTIuY2xpZW50WCkgKyBNYXRoLmFicyhlLmNsaWVudFkgLSBlMi5jbGllbnRZKSA8IDEwKSB7XG4gICAgICAgIGVfcHJldmVudERlZmF1bHQoZTIpO1xuICAgICAgICBpZiAoIW1vZGlmaWVyICYmICtuZXcgRGF0ZSAtIDIwMCA8IHN0YXJ0VGltZSlcbiAgICAgICAgICBleHRlbmRTZWxlY3Rpb24oY20uZG9jLCBzdGFydCk7XG4gICAgICAgIC8vIFdvcmsgYXJvdW5kIHVuZXhwbGFpbmFibGUgZm9jdXMgcHJvYmxlbSBpbiBJRTkgKCMyMTI3KSBhbmQgQ2hyb21lICgjMzA4MSlcbiAgICAgICAgaWYgKHdlYmtpdCB8fCBpZSAmJiBpZV92ZXJzaW9uID09IDkpXG4gICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtkb2N1bWVudC5ib2R5LmZvY3VzKCk7IGRpc3BsYXkuaW5wdXQuZm9jdXMoKTt9LCAyMCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBkaXNwbGF5LmlucHV0LmZvY3VzKCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy8gTGV0IHRoZSBkcmFnIGhhbmRsZXIgaGFuZGxlIHRoaXMuXG4gICAgaWYgKHdlYmtpdCkgZGlzcGxheS5zY3JvbGxlci5kcmFnZ2FibGUgPSB0cnVlO1xuICAgIGNtLnN0YXRlLmRyYWdnaW5nVGV4dCA9IGRyYWdFbmQ7XG4gICAgLy8gSUUncyBhcHByb2FjaCB0byBkcmFnZ2FibGVcbiAgICBpZiAoZGlzcGxheS5zY3JvbGxlci5kcmFnRHJvcCkgZGlzcGxheS5zY3JvbGxlci5kcmFnRHJvcCgpO1xuICAgIG9uKGRvY3VtZW50LCBcIm1vdXNldXBcIiwgZHJhZ0VuZCk7XG4gICAgb24oZGlzcGxheS5zY3JvbGxlciwgXCJkcm9wXCIsIGRyYWdFbmQpO1xuICB9XG5cbiAgLy8gTm9ybWFsIHNlbGVjdGlvbiwgYXMgb3Bwb3NlZCB0byB0ZXh0IGRyYWdnaW5nLlxuICBmdW5jdGlvbiBsZWZ0QnV0dG9uU2VsZWN0KGNtLCBlLCBzdGFydCwgdHlwZSwgYWRkTmV3KSB7XG4gICAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcblxuICAgIHZhciBvdXJSYW5nZSwgb3VySW5kZXgsIHN0YXJ0U2VsID0gZG9jLnNlbCwgcmFuZ2VzID0gc3RhcnRTZWwucmFuZ2VzO1xuICAgIGlmIChhZGROZXcgJiYgIWUuc2hpZnRLZXkpIHtcbiAgICAgIG91ckluZGV4ID0gZG9jLnNlbC5jb250YWlucyhzdGFydCk7XG4gICAgICBpZiAob3VySW5kZXggPiAtMSlcbiAgICAgICAgb3VyUmFuZ2UgPSByYW5nZXNbb3VySW5kZXhdO1xuICAgICAgZWxzZVxuICAgICAgICBvdXJSYW5nZSA9IG5ldyBSYW5nZShzdGFydCwgc3RhcnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXJSYW5nZSA9IGRvYy5zZWwucHJpbWFyeSgpO1xuICAgICAgb3VySW5kZXggPSBkb2Muc2VsLnByaW1JbmRleDtcbiAgICB9XG5cbiAgICBpZiAoZS5hbHRLZXkpIHtcbiAgICAgIHR5cGUgPSBcInJlY3RcIjtcbiAgICAgIGlmICghYWRkTmV3KSBvdXJSYW5nZSA9IG5ldyBSYW5nZShzdGFydCwgc3RhcnQpO1xuICAgICAgc3RhcnQgPSBwb3NGcm9tTW91c2UoY20sIGUsIHRydWUsIHRydWUpO1xuICAgICAgb3VySW5kZXggPSAtMTtcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT0gXCJkb3VibGVcIikge1xuICAgICAgdmFyIHdvcmQgPSBjbS5maW5kV29yZEF0KHN0YXJ0KTtcbiAgICAgIGlmIChjbS5kaXNwbGF5LnNoaWZ0IHx8IGRvYy5leHRlbmQpXG4gICAgICAgIG91clJhbmdlID0gZXh0ZW5kUmFuZ2UoZG9jLCBvdXJSYW5nZSwgd29yZC5hbmNob3IsIHdvcmQuaGVhZCk7XG4gICAgICBlbHNlXG4gICAgICAgIG91clJhbmdlID0gd29yZDtcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT0gXCJ0cmlwbGVcIikge1xuICAgICAgdmFyIGxpbmUgPSBuZXcgUmFuZ2UoUG9zKHN0YXJ0LmxpbmUsIDApLCBjbGlwUG9zKGRvYywgUG9zKHN0YXJ0LmxpbmUgKyAxLCAwKSkpO1xuICAgICAgaWYgKGNtLmRpc3BsYXkuc2hpZnQgfHwgZG9jLmV4dGVuZClcbiAgICAgICAgb3VyUmFuZ2UgPSBleHRlbmRSYW5nZShkb2MsIG91clJhbmdlLCBsaW5lLmFuY2hvciwgbGluZS5oZWFkKTtcbiAgICAgIGVsc2VcbiAgICAgICAgb3VyUmFuZ2UgPSBsaW5lO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXJSYW5nZSA9IGV4dGVuZFJhbmdlKGRvYywgb3VyUmFuZ2UsIHN0YXJ0KTtcbiAgICB9XG5cbiAgICBpZiAoIWFkZE5ldykge1xuICAgICAgb3VySW5kZXggPSAwO1xuICAgICAgc2V0U2VsZWN0aW9uKGRvYywgbmV3IFNlbGVjdGlvbihbb3VyUmFuZ2VdLCAwKSwgc2VsX21vdXNlKTtcbiAgICAgIHN0YXJ0U2VsID0gZG9jLnNlbDtcbiAgICB9IGVsc2UgaWYgKG91ckluZGV4ID09IC0xKSB7XG4gICAgICBvdXJJbmRleCA9IHJhbmdlcy5sZW5ndGg7XG4gICAgICBzZXRTZWxlY3Rpb24oZG9jLCBub3JtYWxpemVTZWxlY3Rpb24ocmFuZ2VzLmNvbmNhdChbb3VyUmFuZ2VdKSwgb3VySW5kZXgpLFxuICAgICAgICAgICAgICAgICAgIHtzY3JvbGw6IGZhbHNlLCBvcmlnaW46IFwiKm1vdXNlXCJ9KTtcbiAgICB9IGVsc2UgaWYgKHJhbmdlcy5sZW5ndGggPiAxICYmIHJhbmdlc1tvdXJJbmRleF0uZW1wdHkoKSAmJiB0eXBlID09IFwic2luZ2xlXCIgJiYgIWUuc2hpZnRLZXkpIHtcbiAgICAgIHNldFNlbGVjdGlvbihkb2MsIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMuc2xpY2UoMCwgb3VySW5kZXgpLmNvbmNhdChyYW5nZXMuc2xpY2Uob3VySW5kZXggKyAxKSksIDApLFxuICAgICAgICAgICAgICAgICAgIHtzY3JvbGw6IGZhbHNlLCBvcmlnaW46IFwiKm1vdXNlXCJ9KTtcbiAgICAgIHN0YXJ0U2VsID0gZG9jLnNlbDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVwbGFjZU9uZVNlbGVjdGlvbihkb2MsIG91ckluZGV4LCBvdXJSYW5nZSwgc2VsX21vdXNlKTtcbiAgICB9XG5cbiAgICB2YXIgbGFzdFBvcyA9IHN0YXJ0O1xuICAgIGZ1bmN0aW9uIGV4dGVuZFRvKHBvcykge1xuICAgICAgaWYgKGNtcChsYXN0UG9zLCBwb3MpID09IDApIHJldHVybjtcbiAgICAgIGxhc3RQb3MgPSBwb3M7XG5cbiAgICAgIGlmICh0eXBlID09IFwicmVjdFwiKSB7XG4gICAgICAgIHZhciByYW5nZXMgPSBbXSwgdGFiU2l6ZSA9IGNtLm9wdGlvbnMudGFiU2l6ZTtcbiAgICAgICAgdmFyIHN0YXJ0Q29sID0gY291bnRDb2x1bW4oZ2V0TGluZShkb2MsIHN0YXJ0LmxpbmUpLnRleHQsIHN0YXJ0LmNoLCB0YWJTaXplKTtcbiAgICAgICAgdmFyIHBvc0NvbCA9IGNvdW50Q29sdW1uKGdldExpbmUoZG9jLCBwb3MubGluZSkudGV4dCwgcG9zLmNoLCB0YWJTaXplKTtcbiAgICAgICAgdmFyIGxlZnQgPSBNYXRoLm1pbihzdGFydENvbCwgcG9zQ29sKSwgcmlnaHQgPSBNYXRoLm1heChzdGFydENvbCwgcG9zQ29sKTtcbiAgICAgICAgZm9yICh2YXIgbGluZSA9IE1hdGgubWluKHN0YXJ0LmxpbmUsIHBvcy5saW5lKSwgZW5kID0gTWF0aC5taW4oY20ubGFzdExpbmUoKSwgTWF0aC5tYXgoc3RhcnQubGluZSwgcG9zLmxpbmUpKTtcbiAgICAgICAgICAgICBsaW5lIDw9IGVuZDsgbGluZSsrKSB7XG4gICAgICAgICAgdmFyIHRleHQgPSBnZXRMaW5lKGRvYywgbGluZSkudGV4dCwgbGVmdFBvcyA9IGZpbmRDb2x1bW4odGV4dCwgbGVmdCwgdGFiU2l6ZSk7XG4gICAgICAgICAgaWYgKGxlZnQgPT0gcmlnaHQpXG4gICAgICAgICAgICByYW5nZXMucHVzaChuZXcgUmFuZ2UoUG9zKGxpbmUsIGxlZnRQb3MpLCBQb3MobGluZSwgbGVmdFBvcykpKTtcbiAgICAgICAgICBlbHNlIGlmICh0ZXh0Lmxlbmd0aCA+IGxlZnRQb3MpXG4gICAgICAgICAgICByYW5nZXMucHVzaChuZXcgUmFuZ2UoUG9zKGxpbmUsIGxlZnRQb3MpLCBQb3MobGluZSwgZmluZENvbHVtbih0ZXh0LCByaWdodCwgdGFiU2l6ZSkpKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKSByYW5nZXMucHVzaChuZXcgUmFuZ2Uoc3RhcnQsIHN0YXJ0KSk7XG4gICAgICAgIHNldFNlbGVjdGlvbihkb2MsIG5vcm1hbGl6ZVNlbGVjdGlvbihzdGFydFNlbC5yYW5nZXMuc2xpY2UoMCwgb3VySW5kZXgpLmNvbmNhdChyYW5nZXMpLCBvdXJJbmRleCksXG4gICAgICAgICAgICAgICAgICAgICB7b3JpZ2luOiBcIiptb3VzZVwiLCBzY3JvbGw6IGZhbHNlfSk7XG4gICAgICAgIGNtLnNjcm9sbEludG9WaWV3KHBvcyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgb2xkUmFuZ2UgPSBvdXJSYW5nZTtcbiAgICAgICAgdmFyIGFuY2hvciA9IG9sZFJhbmdlLmFuY2hvciwgaGVhZCA9IHBvcztcbiAgICAgICAgaWYgKHR5cGUgIT0gXCJzaW5nbGVcIikge1xuICAgICAgICAgIGlmICh0eXBlID09IFwiZG91YmxlXCIpXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBjbS5maW5kV29yZEF0KHBvcyk7XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKFBvcyhwb3MubGluZSwgMCksIGNsaXBQb3MoZG9jLCBQb3MocG9zLmxpbmUgKyAxLCAwKSkpO1xuICAgICAgICAgIGlmIChjbXAocmFuZ2UuYW5jaG9yLCBhbmNob3IpID4gMCkge1xuICAgICAgICAgICAgaGVhZCA9IHJhbmdlLmhlYWQ7XG4gICAgICAgICAgICBhbmNob3IgPSBtaW5Qb3Mob2xkUmFuZ2UuZnJvbSgpLCByYW5nZS5hbmNob3IpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBoZWFkID0gcmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgYW5jaG9yID0gbWF4UG9zKG9sZFJhbmdlLnRvKCksIHJhbmdlLmhlYWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB2YXIgcmFuZ2VzID0gc3RhcnRTZWwucmFuZ2VzLnNsaWNlKDApO1xuICAgICAgICByYW5nZXNbb3VySW5kZXhdID0gbmV3IFJhbmdlKGNsaXBQb3MoZG9jLCBhbmNob3IpLCBoZWFkKTtcbiAgICAgICAgc2V0U2VsZWN0aW9uKGRvYywgbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcywgb3VySW5kZXgpLCBzZWxfbW91c2UpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBlZGl0b3JTaXplID0gZGlzcGxheS53cmFwcGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIC8vIFVzZWQgdG8gZW5zdXJlIHRpbWVvdXQgcmUtdHJpZXMgZG9uJ3QgZmlyZSB3aGVuIGFub3RoZXIgZXh0ZW5kXG4gICAgLy8gaGFwcGVuZWQgaW4gdGhlIG1lYW50aW1lIChjbGVhclRpbWVvdXQgaXNuJ3QgcmVsaWFibGUgLS0gYXRcbiAgICAvLyBsZWFzdCBvbiBDaHJvbWUsIHRoZSB0aW1lb3V0cyBzdGlsbCBoYXBwZW4gZXZlbiB3aGVuIGNsZWFyZWQsXG4gICAgLy8gaWYgdGhlIGNsZWFyIGhhcHBlbnMgYWZ0ZXIgdGhlaXIgc2NoZWR1bGVkIGZpcmluZyB0aW1lKS5cbiAgICB2YXIgY291bnRlciA9IDA7XG5cbiAgICBmdW5jdGlvbiBleHRlbmQoZSkge1xuICAgICAgdmFyIGN1ckNvdW50ID0gKytjb3VudGVyO1xuICAgICAgdmFyIGN1ciA9IHBvc0Zyb21Nb3VzZShjbSwgZSwgdHJ1ZSwgdHlwZSA9PSBcInJlY3RcIik7XG4gICAgICBpZiAoIWN1cikgcmV0dXJuO1xuICAgICAgaWYgKGNtcChjdXIsIGxhc3RQb3MpICE9IDApIHtcbiAgICAgICAgY20uY3VyT3AuZm9jdXMgPSBhY3RpdmVFbHQoKTtcbiAgICAgICAgZXh0ZW5kVG8oY3VyKTtcbiAgICAgICAgdmFyIHZpc2libGUgPSB2aXNpYmxlTGluZXMoZGlzcGxheSwgZG9jKTtcbiAgICAgICAgaWYgKGN1ci5saW5lID49IHZpc2libGUudG8gfHwgY3VyLmxpbmUgPCB2aXNpYmxlLmZyb20pXG4gICAgICAgICAgc2V0VGltZW91dChvcGVyYXRpb24oY20sIGZ1bmN0aW9uKCl7aWYgKGNvdW50ZXIgPT0gY3VyQ291bnQpIGV4dGVuZChlKTt9KSwgMTUwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBvdXRzaWRlID0gZS5jbGllbnRZIDwgZWRpdG9yU2l6ZS50b3AgPyAtMjAgOiBlLmNsaWVudFkgPiBlZGl0b3JTaXplLmJvdHRvbSA/IDIwIDogMDtcbiAgICAgICAgaWYgKG91dHNpZGUpIHNldFRpbWVvdXQob3BlcmF0aW9uKGNtLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICBpZiAoY291bnRlciAhPSBjdXJDb3VudCkgcmV0dXJuO1xuICAgICAgICAgIGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wICs9IG91dHNpZGU7XG4gICAgICAgICAgZXh0ZW5kKGUpO1xuICAgICAgICB9KSwgNTApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRvbmUoZSkge1xuICAgICAgY20uc3RhdGUuc2VsZWN0aW5nVGV4dCA9IGZhbHNlO1xuICAgICAgY291bnRlciA9IEluZmluaXR5O1xuICAgICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgIGRpc3BsYXkuaW5wdXQuZm9jdXMoKTtcbiAgICAgIG9mZihkb2N1bWVudCwgXCJtb3VzZW1vdmVcIiwgbW92ZSk7XG4gICAgICBvZmYoZG9jdW1lbnQsIFwibW91c2V1cFwiLCB1cCk7XG4gICAgICBkb2MuaGlzdG9yeS5sYXN0U2VsT3JpZ2luID0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbW92ZSA9IG9wZXJhdGlvbihjbSwgZnVuY3Rpb24oZSkge1xuICAgICAgaWYgKCFlX2J1dHRvbihlKSkgZG9uZShlKTtcbiAgICAgIGVsc2UgZXh0ZW5kKGUpO1xuICAgIH0pO1xuICAgIHZhciB1cCA9IG9wZXJhdGlvbihjbSwgZG9uZSk7XG4gICAgY20uc3RhdGUuc2VsZWN0aW5nVGV4dCA9IHVwO1xuICAgIG9uKGRvY3VtZW50LCBcIm1vdXNlbW92ZVwiLCBtb3ZlKTtcbiAgICBvbihkb2N1bWVudCwgXCJtb3VzZXVwXCIsIHVwKTtcbiAgfVxuXG4gIC8vIERldGVybWluZXMgd2hldGhlciBhbiBldmVudCBoYXBwZW5lZCBpbiB0aGUgZ3V0dGVyLCBhbmQgZmlyZXMgdGhlXG4gIC8vIGhhbmRsZXJzIGZvciB0aGUgY29ycmVzcG9uZGluZyBldmVudC5cbiAgZnVuY3Rpb24gZ3V0dGVyRXZlbnQoY20sIGUsIHR5cGUsIHByZXZlbnQpIHtcbiAgICB0cnkgeyB2YXIgbVggPSBlLmNsaWVudFgsIG1ZID0gZS5jbGllbnRZOyB9XG4gICAgY2F0Y2goZSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICBpZiAobVggPj0gTWF0aC5mbG9vcihjbS5kaXNwbGF5Lmd1dHRlcnMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkucmlnaHQpKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKHByZXZlbnQpIGVfcHJldmVudERlZmF1bHQoZSk7XG5cbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gICAgdmFyIGxpbmVCb3ggPSBkaXNwbGF5LmxpbmVEaXYuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICBpZiAobVkgPiBsaW5lQm94LmJvdHRvbSB8fCAhaGFzSGFuZGxlcihjbSwgdHlwZSkpIHJldHVybiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSk7XG4gICAgbVkgLT0gbGluZUJveC50b3AgLSBkaXNwbGF5LnZpZXdPZmZzZXQ7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNtLm9wdGlvbnMuZ3V0dGVycy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGcgPSBkaXNwbGF5Lmd1dHRlcnMuY2hpbGROb2Rlc1tpXTtcbiAgICAgIGlmIChnICYmIGcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkucmlnaHQgPj0gbVgpIHtcbiAgICAgICAgdmFyIGxpbmUgPSBsaW5lQXRIZWlnaHQoY20uZG9jLCBtWSk7XG4gICAgICAgIHZhciBndXR0ZXIgPSBjbS5vcHRpb25zLmd1dHRlcnNbaV07XG4gICAgICAgIHNpZ25hbChjbSwgdHlwZSwgY20sIGxpbmUsIGd1dHRlciwgZSk7XG4gICAgICAgIHJldHVybiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY2xpY2tJbkd1dHRlcihjbSwgZSkge1xuICAgIHJldHVybiBndXR0ZXJFdmVudChjbSwgZSwgXCJndXR0ZXJDbGlja1wiLCB0cnVlKTtcbiAgfVxuXG4gIC8vIEtsdWRnZSB0byB3b3JrIGFyb3VuZCBzdHJhbmdlIElFIGJlaGF2aW9yIHdoZXJlIGl0J2xsIHNvbWV0aW1lc1xuICAvLyByZS1maXJlIGEgc2VyaWVzIG9mIGRyYWctcmVsYXRlZCBldmVudHMgcmlnaHQgYWZ0ZXIgdGhlIGRyb3AgKCMxNTUxKVxuICB2YXIgbGFzdERyb3AgPSAwO1xuXG4gIGZ1bmN0aW9uIG9uRHJvcChlKSB7XG4gICAgdmFyIGNtID0gdGhpcztcbiAgICBjbGVhckRyYWdDdXJzb3IoY20pO1xuICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSkgfHwgZXZlbnRJbldpZGdldChjbS5kaXNwbGF5LCBlKSlcbiAgICAgIHJldHVybjtcbiAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgIGlmIChpZSkgbGFzdERyb3AgPSArbmV3IERhdGU7XG4gICAgdmFyIHBvcyA9IHBvc0Zyb21Nb3VzZShjbSwgZSwgdHJ1ZSksIGZpbGVzID0gZS5kYXRhVHJhbnNmZXIuZmlsZXM7XG4gICAgaWYgKCFwb3MgfHwgaXNSZWFkT25seShjbSkpIHJldHVybjtcbiAgICAvLyBNaWdodCBiZSBhIGZpbGUgZHJvcCwgaW4gd2hpY2ggY2FzZSB3ZSBzaW1wbHkgZXh0cmFjdCB0aGUgdGV4dFxuICAgIC8vIGFuZCBpbnNlcnQgaXQuXG4gICAgaWYgKGZpbGVzICYmIGZpbGVzLmxlbmd0aCAmJiB3aW5kb3cuRmlsZVJlYWRlciAmJiB3aW5kb3cuRmlsZSkge1xuICAgICAgdmFyIG4gPSBmaWxlcy5sZW5ndGgsIHRleHQgPSBBcnJheShuKSwgcmVhZCA9IDA7XG4gICAgICB2YXIgbG9hZEZpbGUgPSBmdW5jdGlvbihmaWxlLCBpKSB7XG4gICAgICAgIGlmIChjbS5vcHRpb25zLmFsbG93RHJvcEZpbGVUeXBlcyAmJlxuICAgICAgICAgICAgaW5kZXhPZihjbS5vcHRpb25zLmFsbG93RHJvcEZpbGVUeXBlcywgZmlsZS50eXBlKSA9PSAtMSlcbiAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyO1xuICAgICAgICByZWFkZXIub25sb2FkID0gb3BlcmF0aW9uKGNtLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICB2YXIgY29udGVudCA9IHJlYWRlci5yZXN1bHQ7XG4gICAgICAgICAgaWYgKC9bXFx4MDAtXFx4MDhcXHgwZS1cXHgxZl17Mn0vLnRlc3QoY29udGVudCkpIGNvbnRlbnQgPSBcIlwiO1xuICAgICAgICAgIHRleHRbaV0gPSBjb250ZW50O1xuICAgICAgICAgIGlmICgrK3JlYWQgPT0gbikge1xuICAgICAgICAgICAgcG9zID0gY2xpcFBvcyhjbS5kb2MsIHBvcyk7XG4gICAgICAgICAgICB2YXIgY2hhbmdlID0ge2Zyb206IHBvcywgdG86IHBvcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogY20uZG9jLnNwbGl0TGluZXModGV4dC5qb2luKGNtLmRvYy5saW5lU2VwYXJhdG9yKCkpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luOiBcInBhc3RlXCJ9O1xuICAgICAgICAgICAgbWFrZUNoYW5nZShjbS5kb2MsIGNoYW5nZSk7XG4gICAgICAgICAgICBzZXRTZWxlY3Rpb25SZXBsYWNlSGlzdG9yeShjbS5kb2MsIHNpbXBsZVNlbGVjdGlvbihwb3MsIGNoYW5nZUVuZChjaGFuZ2UpKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmVhZGVyLnJlYWRBc1RleHQoZmlsZSk7XG4gICAgICB9O1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIGxvYWRGaWxlKGZpbGVzW2ldLCBpKTtcbiAgICB9IGVsc2UgeyAvLyBOb3JtYWwgZHJvcFxuICAgICAgLy8gRG9uJ3QgZG8gYSByZXBsYWNlIGlmIHRoZSBkcm9wIGhhcHBlbmVkIGluc2lkZSBvZiB0aGUgc2VsZWN0ZWQgdGV4dC5cbiAgICAgIGlmIChjbS5zdGF0ZS5kcmFnZ2luZ1RleHQgJiYgY20uZG9jLnNlbC5jb250YWlucyhwb3MpID4gLTEpIHtcbiAgICAgICAgY20uc3RhdGUuZHJhZ2dpbmdUZXh0KGUpO1xuICAgICAgICAvLyBFbnN1cmUgdGhlIGVkaXRvciBpcyByZS1mb2N1c2VkXG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7Y20uZGlzcGxheS5pbnB1dC5mb2N1cygpO30sIDIwKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgdmFyIHRleHQgPSBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKFwiVGV4dFwiKTtcbiAgICAgICAgaWYgKHRleHQpIHtcbiAgICAgICAgICBpZiAoY20uc3RhdGUuZHJhZ2dpbmdUZXh0ICYmICEobWFjID8gZS5hbHRLZXkgOiBlLmN0cmxLZXkpKVxuICAgICAgICAgICAgdmFyIHNlbGVjdGVkID0gY20ubGlzdFNlbGVjdGlvbnMoKTtcbiAgICAgICAgICBzZXRTZWxlY3Rpb25Ob1VuZG8oY20uZG9jLCBzaW1wbGVTZWxlY3Rpb24ocG9zLCBwb3MpKTtcbiAgICAgICAgICBpZiAoc2VsZWN0ZWQpIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZWN0ZWQubGVuZ3RoOyArK2kpXG4gICAgICAgICAgICByZXBsYWNlUmFuZ2UoY20uZG9jLCBcIlwiLCBzZWxlY3RlZFtpXS5hbmNob3IsIHNlbGVjdGVkW2ldLmhlYWQsIFwiZHJhZ1wiKTtcbiAgICAgICAgICBjbS5yZXBsYWNlU2VsZWN0aW9uKHRleHQsIFwiYXJvdW5kXCIsIFwicGFzdGVcIik7XG4gICAgICAgICAgY20uZGlzcGxheS5pbnB1dC5mb2N1cygpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjYXRjaChlKXt9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25EcmFnU3RhcnQoY20sIGUpIHtcbiAgICBpZiAoaWUgJiYgKCFjbS5zdGF0ZS5kcmFnZ2luZ1RleHQgfHwgK25ldyBEYXRlIC0gbGFzdERyb3AgPCAxMDApKSB7IGVfc3RvcChlKTsgcmV0dXJuOyB9XG4gICAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBldmVudEluV2lkZ2V0KGNtLmRpc3BsYXksIGUpKSByZXR1cm47XG5cbiAgICBlLmRhdGFUcmFuc2Zlci5zZXREYXRhKFwiVGV4dFwiLCBjbS5nZXRTZWxlY3Rpb24oKSk7XG5cbiAgICAvLyBVc2UgZHVtbXkgaW1hZ2UgaW5zdGVhZCBvZiBkZWZhdWx0IGJyb3dzZXJzIGltYWdlLlxuICAgIC8vIFJlY2VudCBTYWZhcmkgKH42LjAuMikgaGF2ZSBhIHRlbmRlbmN5IHRvIHNlZ2ZhdWx0IHdoZW4gdGhpcyBoYXBwZW5zLCBzbyB3ZSBkb24ndCBkbyBpdCB0aGVyZS5cbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIuc2V0RHJhZ0ltYWdlICYmICFzYWZhcmkpIHtcbiAgICAgIHZhciBpbWcgPSBlbHQoXCJpbWdcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogZml4ZWQ7IGxlZnQ6IDA7IHRvcDogMDtcIik7XG4gICAgICBpbWcuc3JjID0gXCJkYXRhOmltYWdlL2dpZjtiYXNlNjQsUjBsR09EbGhBUUFCQUFBQUFDSDVCQUVLQUFFQUxBQUFBQUFCQUFFQUFBSUNUQUVBT3c9PVwiO1xuICAgICAgaWYgKHByZXN0bykge1xuICAgICAgICBpbWcud2lkdGggPSBpbWcuaGVpZ2h0ID0gMTtcbiAgICAgICAgY20uZGlzcGxheS53cmFwcGVyLmFwcGVuZENoaWxkKGltZyk7XG4gICAgICAgIC8vIEZvcmNlIGEgcmVsYXlvdXQsIG9yIE9wZXJhIHdvbid0IHVzZSBvdXIgaW1hZ2UgZm9yIHNvbWUgb2JzY3VyZSByZWFzb25cbiAgICAgICAgaW1nLl90b3AgPSBpbWcub2Zmc2V0VG9wO1xuICAgICAgfVxuICAgICAgZS5kYXRhVHJhbnNmZXIuc2V0RHJhZ0ltYWdlKGltZywgMCwgMCk7XG4gICAgICBpZiAocHJlc3RvKSBpbWcucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChpbWcpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uRHJhZ092ZXIoY20sIGUpIHtcbiAgICB2YXIgcG9zID0gcG9zRnJvbU1vdXNlKGNtLCBlKTtcbiAgICBpZiAoIXBvcykgcmV0dXJuO1xuICAgIHZhciBmcmFnID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgIGRyYXdTZWxlY3Rpb25DdXJzb3IoY20sIHBvcywgZnJhZyk7XG4gICAgaWYgKCFjbS5kaXNwbGF5LmRyYWdDdXJzb3IpIHtcbiAgICAgIGNtLmRpc3BsYXkuZHJhZ0N1cnNvciA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItY3Vyc29ycyBDb2RlTWlycm9yLWRyYWdjdXJzb3JzXCIpO1xuICAgICAgY20uZGlzcGxheS5saW5lU3BhY2UuaW5zZXJ0QmVmb3JlKGNtLmRpc3BsYXkuZHJhZ0N1cnNvciwgY20uZGlzcGxheS5jdXJzb3JEaXYpO1xuICAgIH1cbiAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChjbS5kaXNwbGF5LmRyYWdDdXJzb3IsIGZyYWcpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2xlYXJEcmFnQ3Vyc29yKGNtKSB7XG4gICAgaWYgKGNtLmRpc3BsYXkuZHJhZ0N1cnNvcikge1xuICAgICAgY20uZGlzcGxheS5saW5lU3BhY2UucmVtb3ZlQ2hpbGQoY20uZGlzcGxheS5kcmFnQ3Vyc29yKTtcbiAgICAgIGNtLmRpc3BsYXkuZHJhZ0N1cnNvciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLy8gU0NST0xMIEVWRU5UU1xuXG4gIC8vIFN5bmMgdGhlIHNjcm9sbGFibGUgYXJlYSBhbmQgc2Nyb2xsYmFycywgZW5zdXJlIHRoZSB2aWV3cG9ydFxuICAvLyBjb3ZlcnMgdGhlIHZpc2libGUgYXJlYS5cbiAgZnVuY3Rpb24gc2V0U2Nyb2xsVG9wKGNtLCB2YWwpIHtcbiAgICBpZiAoTWF0aC5hYnMoY20uZG9jLnNjcm9sbFRvcCAtIHZhbCkgPCAyKSByZXR1cm47XG4gICAgY20uZG9jLnNjcm9sbFRvcCA9IHZhbDtcbiAgICBpZiAoIWdlY2tvKSB1cGRhdGVEaXNwbGF5U2ltcGxlKGNtLCB7dG9wOiB2YWx9KTtcbiAgICBpZiAoY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3AgIT0gdmFsKSBjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcCA9IHZhbDtcbiAgICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuc2V0U2Nyb2xsVG9wKHZhbCk7XG4gICAgaWYgKGdlY2tvKSB1cGRhdGVEaXNwbGF5U2ltcGxlKGNtKTtcbiAgICBzdGFydFdvcmtlcihjbSwgMTAwKTtcbiAgfVxuICAvLyBTeW5jIHNjcm9sbGVyIGFuZCBzY3JvbGxiYXIsIGVuc3VyZSB0aGUgZ3V0dGVyIGVsZW1lbnRzIGFyZVxuICAvLyBhbGlnbmVkLlxuICBmdW5jdGlvbiBzZXRTY3JvbGxMZWZ0KGNtLCB2YWwsIGlzU2Nyb2xsZXIpIHtcbiAgICBpZiAoaXNTY3JvbGxlciA/IHZhbCA9PSBjbS5kb2Muc2Nyb2xsTGVmdCA6IE1hdGguYWJzKGNtLmRvYy5zY3JvbGxMZWZ0IC0gdmFsKSA8IDIpIHJldHVybjtcbiAgICB2YWwgPSBNYXRoLm1pbih2YWwsIGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsV2lkdGggLSBjbS5kaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoKTtcbiAgICBjbS5kb2Muc2Nyb2xsTGVmdCA9IHZhbDtcbiAgICBhbGlnbkhvcml6b250YWxseShjbSk7XG4gICAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCAhPSB2YWwpIGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCA9IHZhbDtcbiAgICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuc2V0U2Nyb2xsTGVmdCh2YWwpO1xuICB9XG5cbiAgLy8gU2luY2UgdGhlIGRlbHRhIHZhbHVlcyByZXBvcnRlZCBvbiBtb3VzZSB3aGVlbCBldmVudHMgYXJlXG4gIC8vIHVuc3RhbmRhcmRpemVkIGJldHdlZW4gYnJvd3NlcnMgYW5kIGV2ZW4gYnJvd3NlciB2ZXJzaW9ucywgYW5kXG4gIC8vIGdlbmVyYWxseSBob3JyaWJseSB1bnByZWRpY3RhYmxlLCB0aGlzIGNvZGUgc3RhcnRzIGJ5IG1lYXN1cmluZ1xuICAvLyB0aGUgc2Nyb2xsIGVmZmVjdCB0aGF0IHRoZSBmaXJzdCBmZXcgbW91c2Ugd2hlZWwgZXZlbnRzIGhhdmUsXG4gIC8vIGFuZCwgZnJvbSB0aGF0LCBkZXRlY3RzIHRoZSB3YXkgaXQgY2FuIGNvbnZlcnQgZGVsdGFzIHRvIHBpeGVsXG4gIC8vIG9mZnNldHMgYWZ0ZXJ3YXJkcy5cbiAgLy9cbiAgLy8gVGhlIHJlYXNvbiB3ZSB3YW50IHRvIGtub3cgdGhlIGFtb3VudCBhIHdoZWVsIGV2ZW50IHdpbGwgc2Nyb2xsXG4gIC8vIGlzIHRoYXQgaXQgZ2l2ZXMgdXMgYSBjaGFuY2UgdG8gdXBkYXRlIHRoZSBkaXNwbGF5IGJlZm9yZSB0aGVcbiAgLy8gYWN0dWFsIHNjcm9sbGluZyBoYXBwZW5zLCByZWR1Y2luZyBmbGlja2VyaW5nLlxuXG4gIHZhciB3aGVlbFNhbXBsZXMgPSAwLCB3aGVlbFBpeGVsc1BlclVuaXQgPSBudWxsO1xuICAvLyBGaWxsIGluIGEgYnJvd3Nlci1kZXRlY3RlZCBzdGFydGluZyB2YWx1ZSBvbiBicm93c2VycyB3aGVyZSB3ZVxuICAvLyBrbm93IG9uZS4gVGhlc2UgZG9uJ3QgaGF2ZSB0byBiZSBhY2N1cmF0ZSAtLSB0aGUgcmVzdWx0IG9mIHRoZW1cbiAgLy8gYmVpbmcgd3Jvbmcgd291bGQganVzdCBiZSBhIHNsaWdodCBmbGlja2VyIG9uIHRoZSBmaXJzdCB3aGVlbFxuICAvLyBzY3JvbGwgKGlmIGl0IGlzIGxhcmdlIGVub3VnaCkuXG4gIGlmIChpZSkgd2hlZWxQaXhlbHNQZXJVbml0ID0gLS41MztcbiAgZWxzZSBpZiAoZ2Vja28pIHdoZWVsUGl4ZWxzUGVyVW5pdCA9IDE1O1xuICBlbHNlIGlmIChjaHJvbWUpIHdoZWVsUGl4ZWxzUGVyVW5pdCA9IC0uNztcbiAgZWxzZSBpZiAoc2FmYXJpKSB3aGVlbFBpeGVsc1BlclVuaXQgPSAtMS8zO1xuXG4gIHZhciB3aGVlbEV2ZW50RGVsdGEgPSBmdW5jdGlvbihlKSB7XG4gICAgdmFyIGR4ID0gZS53aGVlbERlbHRhWCwgZHkgPSBlLndoZWVsRGVsdGFZO1xuICAgIGlmIChkeCA9PSBudWxsICYmIGUuZGV0YWlsICYmIGUuYXhpcyA9PSBlLkhPUklaT05UQUxfQVhJUykgZHggPSBlLmRldGFpbDtcbiAgICBpZiAoZHkgPT0gbnVsbCAmJiBlLmRldGFpbCAmJiBlLmF4aXMgPT0gZS5WRVJUSUNBTF9BWElTKSBkeSA9IGUuZGV0YWlsO1xuICAgIGVsc2UgaWYgKGR5ID09IG51bGwpIGR5ID0gZS53aGVlbERlbHRhO1xuICAgIHJldHVybiB7eDogZHgsIHk6IGR5fTtcbiAgfTtcbiAgQ29kZU1pcnJvci53aGVlbEV2ZW50UGl4ZWxzID0gZnVuY3Rpb24oZSkge1xuICAgIHZhciBkZWx0YSA9IHdoZWVsRXZlbnREZWx0YShlKTtcbiAgICBkZWx0YS54ICo9IHdoZWVsUGl4ZWxzUGVyVW5pdDtcbiAgICBkZWx0YS55ICo9IHdoZWVsUGl4ZWxzUGVyVW5pdDtcbiAgICByZXR1cm4gZGVsdGE7XG4gIH07XG5cbiAgZnVuY3Rpb24gb25TY3JvbGxXaGVlbChjbSwgZSkge1xuICAgIHZhciBkZWx0YSA9IHdoZWVsRXZlbnREZWx0YShlKSwgZHggPSBkZWx0YS54LCBkeSA9IGRlbHRhLnk7XG5cbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIHNjcm9sbCA9IGRpc3BsYXkuc2Nyb2xsZXI7XG4gICAgLy8gUXVpdCBpZiB0aGVyZSdzIG5vdGhpbmcgdG8gc2Nyb2xsIGhlcmVcbiAgICB2YXIgY2FuU2Nyb2xsWCA9IHNjcm9sbC5zY3JvbGxXaWR0aCA+IHNjcm9sbC5jbGllbnRXaWR0aDtcbiAgICB2YXIgY2FuU2Nyb2xsWSA9IHNjcm9sbC5zY3JvbGxIZWlnaHQgPiBzY3JvbGwuY2xpZW50SGVpZ2h0O1xuICAgIGlmICghKGR4ICYmIGNhblNjcm9sbFggfHwgZHkgJiYgY2FuU2Nyb2xsWSkpIHJldHVybjtcblxuICAgIC8vIFdlYmtpdCBicm93c2VycyBvbiBPUyBYIGFib3J0IG1vbWVudHVtIHNjcm9sbHMgd2hlbiB0aGUgdGFyZ2V0XG4gICAgLy8gb2YgdGhlIHNjcm9sbCBldmVudCBpcyByZW1vdmVkIGZyb20gdGhlIHNjcm9sbGFibGUgZWxlbWVudC5cbiAgICAvLyBUaGlzIGhhY2sgKHNlZSByZWxhdGVkIGNvZGUgaW4gcGF0Y2hEaXNwbGF5KSBtYWtlcyBzdXJlIHRoZVxuICAgIC8vIGVsZW1lbnQgaXMga2VwdCBhcm91bmQuXG4gICAgaWYgKGR5ICYmIG1hYyAmJiB3ZWJraXQpIHtcbiAgICAgIG91dGVyOiBmb3IgKHZhciBjdXIgPSBlLnRhcmdldCwgdmlldyA9IGRpc3BsYXkudmlldzsgY3VyICE9IHNjcm9sbDsgY3VyID0gY3VyLnBhcmVudE5vZGUpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYgKHZpZXdbaV0ubm9kZSA9PSBjdXIpIHtcbiAgICAgICAgICAgIGNtLmRpc3BsYXkuY3VycmVudFdoZWVsVGFyZ2V0ID0gY3VyO1xuICAgICAgICAgICAgYnJlYWsgb3V0ZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gT24gc29tZSBicm93c2VycywgaG9yaXpvbnRhbCBzY3JvbGxpbmcgd2lsbCBjYXVzZSByZWRyYXdzIHRvXG4gICAgLy8gaGFwcGVuIGJlZm9yZSB0aGUgZ3V0dGVyIGhhcyBiZWVuIHJlYWxpZ25lZCwgY2F1c2luZyBpdCB0b1xuICAgIC8vIHdyaWdnbGUgYXJvdW5kIGluIGEgbW9zdCB1bnNlZW1seSB3YXkuIFdoZW4gd2UgaGF2ZSBhblxuICAgIC8vIGVzdGltYXRlZCBwaXhlbHMvZGVsdGEgdmFsdWUsIHdlIGp1c3QgaGFuZGxlIGhvcml6b250YWxcbiAgICAvLyBzY3JvbGxpbmcgZW50aXJlbHkgaGVyZS4gSXQnbGwgYmUgc2xpZ2h0bHkgb2ZmIGZyb20gbmF0aXZlLCBidXRcbiAgICAvLyBiZXR0ZXIgdGhhbiBnbGl0Y2hpbmcgb3V0LlxuICAgIGlmIChkeCAmJiAhZ2Vja28gJiYgIXByZXN0byAmJiB3aGVlbFBpeGVsc1BlclVuaXQgIT0gbnVsbCkge1xuICAgICAgaWYgKGR5ICYmIGNhblNjcm9sbFkpXG4gICAgICAgIHNldFNjcm9sbFRvcChjbSwgTWF0aC5tYXgoMCwgTWF0aC5taW4oc2Nyb2xsLnNjcm9sbFRvcCArIGR5ICogd2hlZWxQaXhlbHNQZXJVbml0LCBzY3JvbGwuc2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsLmNsaWVudEhlaWdodCkpKTtcbiAgICAgIHNldFNjcm9sbExlZnQoY20sIE1hdGgubWF4KDAsIE1hdGgubWluKHNjcm9sbC5zY3JvbGxMZWZ0ICsgZHggKiB3aGVlbFBpeGVsc1BlclVuaXQsIHNjcm9sbC5zY3JvbGxXaWR0aCAtIHNjcm9sbC5jbGllbnRXaWR0aCkpKTtcbiAgICAgIC8vIE9ubHkgcHJldmVudCBkZWZhdWx0IHNjcm9sbGluZyBpZiB2ZXJ0aWNhbCBzY3JvbGxpbmcgaXNcbiAgICAgIC8vIGFjdHVhbGx5IHBvc3NpYmxlLiBPdGhlcndpc2UsIGl0IGNhdXNlcyB2ZXJ0aWNhbCBzY3JvbGxcbiAgICAgIC8vIGppdHRlciBvbiBPU1ggdHJhY2twYWRzIHdoZW4gZGVsdGFYIGlzIHNtYWxsIGFuZCBkZWx0YVlcbiAgICAgIC8vIGlzIGxhcmdlIChpc3N1ZSAjMzU3OSlcbiAgICAgIGlmICghZHkgfHwgKGR5ICYmIGNhblNjcm9sbFkpKVxuICAgICAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgZGlzcGxheS53aGVlbFN0YXJ0WCA9IG51bGw7IC8vIEFib3J0IG1lYXN1cmVtZW50LCBpZiBpbiBwcm9ncmVzc1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vICdQcm9qZWN0JyB0aGUgdmlzaWJsZSB2aWV3cG9ydCB0byBjb3ZlciB0aGUgYXJlYSB0aGF0IGlzIGJlaW5nXG4gICAgLy8gc2Nyb2xsZWQgaW50byB2aWV3IChpZiB3ZSBrbm93IGVub3VnaCB0byBlc3RpbWF0ZSBpdCkuXG4gICAgaWYgKGR5ICYmIHdoZWVsUGl4ZWxzUGVyVW5pdCAhPSBudWxsKSB7XG4gICAgICB2YXIgcGl4ZWxzID0gZHkgKiB3aGVlbFBpeGVsc1BlclVuaXQ7XG4gICAgICB2YXIgdG9wID0gY20uZG9jLnNjcm9sbFRvcCwgYm90ID0gdG9wICsgZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodDtcbiAgICAgIGlmIChwaXhlbHMgPCAwKSB0b3AgPSBNYXRoLm1heCgwLCB0b3AgKyBwaXhlbHMgLSA1MCk7XG4gICAgICBlbHNlIGJvdCA9IE1hdGgubWluKGNtLmRvYy5oZWlnaHQsIGJvdCArIHBpeGVscyArIDUwKTtcbiAgICAgIHVwZGF0ZURpc3BsYXlTaW1wbGUoY20sIHt0b3A6IHRvcCwgYm90dG9tOiBib3R9KTtcbiAgICB9XG5cbiAgICBpZiAod2hlZWxTYW1wbGVzIDwgMjApIHtcbiAgICAgIGlmIChkaXNwbGF5LndoZWVsU3RhcnRYID09IG51bGwpIHtcbiAgICAgICAgZGlzcGxheS53aGVlbFN0YXJ0WCA9IHNjcm9sbC5zY3JvbGxMZWZ0OyBkaXNwbGF5LndoZWVsU3RhcnRZID0gc2Nyb2xsLnNjcm9sbFRvcDtcbiAgICAgICAgZGlzcGxheS53aGVlbERYID0gZHg7IGRpc3BsYXkud2hlZWxEWSA9IGR5O1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGlmIChkaXNwbGF5LndoZWVsU3RhcnRYID09IG51bGwpIHJldHVybjtcbiAgICAgICAgICB2YXIgbW92ZWRYID0gc2Nyb2xsLnNjcm9sbExlZnQgLSBkaXNwbGF5LndoZWVsU3RhcnRYO1xuICAgICAgICAgIHZhciBtb3ZlZFkgPSBzY3JvbGwuc2Nyb2xsVG9wIC0gZGlzcGxheS53aGVlbFN0YXJ0WTtcbiAgICAgICAgICB2YXIgc2FtcGxlID0gKG1vdmVkWSAmJiBkaXNwbGF5LndoZWVsRFkgJiYgbW92ZWRZIC8gZGlzcGxheS53aGVlbERZKSB8fFxuICAgICAgICAgICAgKG1vdmVkWCAmJiBkaXNwbGF5LndoZWVsRFggJiYgbW92ZWRYIC8gZGlzcGxheS53aGVlbERYKTtcbiAgICAgICAgICBkaXNwbGF5LndoZWVsU3RhcnRYID0gZGlzcGxheS53aGVlbFN0YXJ0WSA9IG51bGw7XG4gICAgICAgICAgaWYgKCFzYW1wbGUpIHJldHVybjtcbiAgICAgICAgICB3aGVlbFBpeGVsc1BlclVuaXQgPSAod2hlZWxQaXhlbHNQZXJVbml0ICogd2hlZWxTYW1wbGVzICsgc2FtcGxlKSAvICh3aGVlbFNhbXBsZXMgKyAxKTtcbiAgICAgICAgICArK3doZWVsU2FtcGxlcztcbiAgICAgICAgfSwgMjAwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRpc3BsYXkud2hlZWxEWCArPSBkeDsgZGlzcGxheS53aGVlbERZICs9IGR5O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEtFWSBFVkVOVFNcblxuICAvLyBSdW4gYSBoYW5kbGVyIHRoYXQgd2FzIGJvdW5kIHRvIGEga2V5LlxuICBmdW5jdGlvbiBkb0hhbmRsZUJpbmRpbmcoY20sIGJvdW5kLCBkcm9wU2hpZnQpIHtcbiAgICBpZiAodHlwZW9mIGJvdW5kID09IFwic3RyaW5nXCIpIHtcbiAgICAgIGJvdW5kID0gY29tbWFuZHNbYm91bmRdO1xuICAgICAgaWYgKCFib3VuZCkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBFbnN1cmUgcHJldmlvdXMgaW5wdXQgaGFzIGJlZW4gcmVhZCwgc28gdGhhdCB0aGUgaGFuZGxlciBzZWVzIGFcbiAgICAvLyBjb25zaXN0ZW50IHZpZXcgb2YgdGhlIGRvY3VtZW50XG4gICAgY20uZGlzcGxheS5pbnB1dC5lbnN1cmVQb2xsZWQoKTtcbiAgICB2YXIgcHJldlNoaWZ0ID0gY20uZGlzcGxheS5zaGlmdCwgZG9uZSA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBpZiAoaXNSZWFkT25seShjbSkpIGNtLnN0YXRlLnN1cHByZXNzRWRpdHMgPSB0cnVlO1xuICAgICAgaWYgKGRyb3BTaGlmdCkgY20uZGlzcGxheS5zaGlmdCA9IGZhbHNlO1xuICAgICAgZG9uZSA9IGJvdW5kKGNtKSAhPSBQYXNzO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbS5kaXNwbGF5LnNoaWZ0ID0gcHJldlNoaWZ0O1xuICAgICAgY20uc3RhdGUuc3VwcHJlc3NFZGl0cyA9IGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gZG9uZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGxvb2t1cEtleUZvckVkaXRvcihjbSwgbmFtZSwgaGFuZGxlKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbS5zdGF0ZS5rZXlNYXBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gbG9va3VwS2V5KG5hbWUsIGNtLnN0YXRlLmtleU1hcHNbaV0sIGhhbmRsZSwgY20pO1xuICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIChjbS5vcHRpb25zLmV4dHJhS2V5cyAmJiBsb29rdXBLZXkobmFtZSwgY20ub3B0aW9ucy5leHRyYUtleXMsIGhhbmRsZSwgY20pKVxuICAgICAgfHwgbG9va3VwS2V5KG5hbWUsIGNtLm9wdGlvbnMua2V5TWFwLCBoYW5kbGUsIGNtKTtcbiAgfVxuXG4gIHZhciBzdG9wU2VxID0gbmV3IERlbGF5ZWQ7XG4gIGZ1bmN0aW9uIGRpc3BhdGNoS2V5KGNtLCBuYW1lLCBlLCBoYW5kbGUpIHtcbiAgICB2YXIgc2VxID0gY20uc3RhdGUua2V5U2VxO1xuICAgIGlmIChzZXEpIHtcbiAgICAgIGlmIChpc01vZGlmaWVyS2V5KG5hbWUpKSByZXR1cm4gXCJoYW5kbGVkXCI7XG4gICAgICBzdG9wU2VxLnNldCg1MCwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChjbS5zdGF0ZS5rZXlTZXEgPT0gc2VxKSB7XG4gICAgICAgICAgY20uc3RhdGUua2V5U2VxID0gbnVsbDtcbiAgICAgICAgICBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgbmFtZSA9IHNlcSArIFwiIFwiICsgbmFtZTtcbiAgICB9XG4gICAgdmFyIHJlc3VsdCA9IGxvb2t1cEtleUZvckVkaXRvcihjbSwgbmFtZSwgaGFuZGxlKTtcblxuICAgIGlmIChyZXN1bHQgPT0gXCJtdWx0aVwiKVxuICAgICAgY20uc3RhdGUua2V5U2VxID0gbmFtZTtcbiAgICBpZiAocmVzdWx0ID09IFwiaGFuZGxlZFwiKVxuICAgICAgc2lnbmFsTGF0ZXIoY20sIFwia2V5SGFuZGxlZFwiLCBjbSwgbmFtZSwgZSk7XG5cbiAgICBpZiAocmVzdWx0ID09IFwiaGFuZGxlZFwiIHx8IHJlc3VsdCA9PSBcIm11bHRpXCIpIHtcbiAgICAgIGVfcHJldmVudERlZmF1bHQoZSk7XG4gICAgICByZXN0YXJ0QmxpbmsoY20pO1xuICAgIH1cblxuICAgIGlmIChzZXEgJiYgIXJlc3VsdCAmJiAvXFwnJC8udGVzdChuYW1lKSkge1xuICAgICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gISFyZXN1bHQ7XG4gIH1cblxuICAvLyBIYW5kbGUgYSBrZXkgZnJvbSB0aGUga2V5ZG93biBldmVudC5cbiAgZnVuY3Rpb24gaGFuZGxlS2V5QmluZGluZyhjbSwgZSkge1xuICAgIHZhciBuYW1lID0ga2V5TmFtZShlLCB0cnVlKTtcbiAgICBpZiAoIW5hbWUpIHJldHVybiBmYWxzZTtcblxuICAgIGlmIChlLnNoaWZ0S2V5ICYmICFjbS5zdGF0ZS5rZXlTZXEpIHtcbiAgICAgIC8vIEZpcnN0IHRyeSB0byByZXNvbHZlIGZ1bGwgbmFtZSAoaW5jbHVkaW5nICdTaGlmdC0nKS4gRmFpbGluZ1xuICAgICAgLy8gdGhhdCwgc2VlIGlmIHRoZXJlIGlzIGEgY3Vyc29yLW1vdGlvbiBjb21tYW5kIChzdGFydGluZyB3aXRoXG4gICAgICAvLyAnZ28nKSBib3VuZCB0byB0aGUga2V5bmFtZSB3aXRob3V0ICdTaGlmdC0nLlxuICAgICAgcmV0dXJuIGRpc3BhdGNoS2V5KGNtLCBcIlNoaWZ0LVwiICsgbmFtZSwgZSwgZnVuY3Rpb24oYikge3JldHVybiBkb0hhbmRsZUJpbmRpbmcoY20sIGIsIHRydWUpO30pXG4gICAgICAgICAgfHwgZGlzcGF0Y2hLZXkoY20sIG5hbWUsIGUsIGZ1bmN0aW9uKGIpIHtcbiAgICAgICAgICAgICAgIGlmICh0eXBlb2YgYiA9PSBcInN0cmluZ1wiID8gL15nb1tBLVpdLy50ZXN0KGIpIDogYi5tb3Rpb24pXG4gICAgICAgICAgICAgICAgIHJldHVybiBkb0hhbmRsZUJpbmRpbmcoY20sIGIpO1xuICAgICAgICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZGlzcGF0Y2hLZXkoY20sIG5hbWUsIGUsIGZ1bmN0aW9uKGIpIHsgcmV0dXJuIGRvSGFuZGxlQmluZGluZyhjbSwgYik7IH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBhIGtleSBmcm9tIHRoZSBrZXlwcmVzcyBldmVudFxuICBmdW5jdGlvbiBoYW5kbGVDaGFyQmluZGluZyhjbSwgZSwgY2gpIHtcbiAgICByZXR1cm4gZGlzcGF0Y2hLZXkoY20sIFwiJ1wiICsgY2ggKyBcIidcIiwgZSxcbiAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oYikgeyByZXR1cm4gZG9IYW5kbGVCaW5kaW5nKGNtLCBiLCB0cnVlKTsgfSk7XG4gIH1cblxuICB2YXIgbGFzdFN0b3BwZWRLZXkgPSBudWxsO1xuICBmdW5jdGlvbiBvbktleURvd24oZSkge1xuICAgIHZhciBjbSA9IHRoaXM7XG4gICAgY20uY3VyT3AuZm9jdXMgPSBhY3RpdmVFbHQoKTtcbiAgICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpKSByZXR1cm47XG4gICAgLy8gSUUgZG9lcyBzdHJhbmdlIHRoaW5ncyB3aXRoIGVzY2FwZS5cbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDExICYmIGUua2V5Q29kZSA9PSAyNykgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlO1xuICAgIHZhciBjb2RlID0gZS5rZXlDb2RlO1xuICAgIGNtLmRpc3BsYXkuc2hpZnQgPSBjb2RlID09IDE2IHx8IGUuc2hpZnRLZXk7XG4gICAgdmFyIGhhbmRsZWQgPSBoYW5kbGVLZXlCaW5kaW5nKGNtLCBlKTtcbiAgICBpZiAocHJlc3RvKSB7XG4gICAgICBsYXN0U3RvcHBlZEtleSA9IGhhbmRsZWQgPyBjb2RlIDogbnVsbDtcbiAgICAgIC8vIE9wZXJhIGhhcyBubyBjdXQgZXZlbnQuLi4gd2UgdHJ5IHRvIGF0IGxlYXN0IGNhdGNoIHRoZSBrZXkgY29tYm9cbiAgICAgIGlmICghaGFuZGxlZCAmJiBjb2RlID09IDg4ICYmICFoYXNDb3B5RXZlbnQgJiYgKG1hYyA/IGUubWV0YUtleSA6IGUuY3RybEtleSkpXG4gICAgICAgIGNtLnJlcGxhY2VTZWxlY3Rpb24oXCJcIiwgbnVsbCwgXCJjdXRcIik7XG4gICAgfVxuXG4gICAgLy8gVHVybiBtb3VzZSBpbnRvIGNyb3NzaGFpciB3aGVuIEFsdCBpcyBoZWxkIG9uIE1hYy5cbiAgICBpZiAoY29kZSA9PSAxOCAmJiAhL1xcYkNvZGVNaXJyb3ItY3Jvc3NoYWlyXFxiLy50ZXN0KGNtLmRpc3BsYXkubGluZURpdi5jbGFzc05hbWUpKVxuICAgICAgc2hvd0Nyb3NzSGFpcihjbSk7XG4gIH1cblxuICBmdW5jdGlvbiBzaG93Q3Jvc3NIYWlyKGNtKSB7XG4gICAgdmFyIGxpbmVEaXYgPSBjbS5kaXNwbGF5LmxpbmVEaXY7XG4gICAgYWRkQ2xhc3MobGluZURpdiwgXCJDb2RlTWlycm9yLWNyb3NzaGFpclwiKTtcblxuICAgIGZ1bmN0aW9uIHVwKGUpIHtcbiAgICAgIGlmIChlLmtleUNvZGUgPT0gMTggfHwgIWUuYWx0S2V5KSB7XG4gICAgICAgIHJtQ2xhc3MobGluZURpdiwgXCJDb2RlTWlycm9yLWNyb3NzaGFpclwiKTtcbiAgICAgICAgb2ZmKGRvY3VtZW50LCBcImtleXVwXCIsIHVwKTtcbiAgICAgICAgb2ZmKGRvY3VtZW50LCBcIm1vdXNlb3ZlclwiLCB1cCk7XG4gICAgICB9XG4gICAgfVxuICAgIG9uKGRvY3VtZW50LCBcImtleXVwXCIsIHVwKTtcbiAgICBvbihkb2N1bWVudCwgXCJtb3VzZW92ZXJcIiwgdXApO1xuICB9XG5cbiAgZnVuY3Rpb24gb25LZXlVcChlKSB7XG4gICAgaWYgKGUua2V5Q29kZSA9PSAxNikgdGhpcy5kb2Muc2VsLnNoaWZ0ID0gZmFsc2U7XG4gICAgc2lnbmFsRE9NRXZlbnQodGhpcywgZSk7XG4gIH1cblxuICBmdW5jdGlvbiBvbktleVByZXNzKGUpIHtcbiAgICB2YXIgY20gPSB0aGlzO1xuICAgIGlmIChldmVudEluV2lkZ2V0KGNtLmRpc3BsYXksIGUpIHx8IHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBlLmN0cmxLZXkgJiYgIWUuYWx0S2V5IHx8IG1hYyAmJiBlLm1ldGFLZXkpIHJldHVybjtcbiAgICB2YXIga2V5Q29kZSA9IGUua2V5Q29kZSwgY2hhckNvZGUgPSBlLmNoYXJDb2RlO1xuICAgIGlmIChwcmVzdG8gJiYga2V5Q29kZSA9PSBsYXN0U3RvcHBlZEtleSkge2xhc3RTdG9wcGVkS2V5ID0gbnVsbDsgZV9wcmV2ZW50RGVmYXVsdChlKTsgcmV0dXJuO31cbiAgICBpZiAoKHByZXN0byAmJiAoIWUud2hpY2ggfHwgZS53aGljaCA8IDEwKSkgJiYgaGFuZGxlS2V5QmluZGluZyhjbSwgZSkpIHJldHVybjtcbiAgICB2YXIgY2ggPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXJDb2RlID09IG51bGwgPyBrZXlDb2RlIDogY2hhckNvZGUpO1xuICAgIGlmIChoYW5kbGVDaGFyQmluZGluZyhjbSwgZSwgY2gpKSByZXR1cm47XG4gICAgY20uZGlzcGxheS5pbnB1dC5vbktleVByZXNzKGUpO1xuICB9XG5cbiAgLy8gRk9DVVMvQkxVUiBFVkVOVFNcblxuICBmdW5jdGlvbiBkZWxheUJsdXJFdmVudChjbSkge1xuICAgIGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50ID0gdHJ1ZTtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50KSB7XG4gICAgICAgIGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50ID0gZmFsc2U7XG4gICAgICAgIG9uQmx1cihjbSk7XG4gICAgICB9XG4gICAgfSwgMTAwKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uRm9jdXMoY20pIHtcbiAgICBpZiAoY20uc3RhdGUuZGVsYXlpbmdCbHVyRXZlbnQpIGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50ID0gZmFsc2U7XG5cbiAgICBpZiAoY20ub3B0aW9ucy5yZWFkT25seSA9PSBcIm5vY3Vyc29yXCIpIHJldHVybjtcbiAgICBpZiAoIWNtLnN0YXRlLmZvY3VzZWQpIHtcbiAgICAgIHNpZ25hbChjbSwgXCJmb2N1c1wiLCBjbSk7XG4gICAgICBjbS5zdGF0ZS5mb2N1c2VkID0gdHJ1ZTtcbiAgICAgIGFkZENsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgXCJDb2RlTWlycm9yLWZvY3VzZWRcIik7XG4gICAgICAvLyBUaGlzIHRlc3QgcHJldmVudHMgdGhpcyBmcm9tIGZpcmluZyB3aGVuIGEgY29udGV4dFxuICAgICAgLy8gbWVudSBpcyBjbG9zZWQgKHNpbmNlIHRoZSBpbnB1dCByZXNldCB3b3VsZCBraWxsIHRoZVxuICAgICAgLy8gc2VsZWN0LWFsbCBkZXRlY3Rpb24gaGFjaylcbiAgICAgIGlmICghY20uY3VyT3AgJiYgY20uZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSAhPSBjbS5kb2Muc2VsKSB7XG4gICAgICAgIGNtLmRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgICAgICAgaWYgKHdlYmtpdCkgc2V0VGltZW91dChmdW5jdGlvbigpIHsgY20uZGlzcGxheS5pbnB1dC5yZXNldCh0cnVlKTsgfSwgMjApOyAvLyBJc3N1ZSAjMTczMFxuICAgICAgfVxuICAgICAgY20uZGlzcGxheS5pbnB1dC5yZWNlaXZlZEZvY3VzKCk7XG4gICAgfVxuICAgIHJlc3RhcnRCbGluayhjbSk7XG4gIH1cbiAgZnVuY3Rpb24gb25CbHVyKGNtKSB7XG4gICAgaWYgKGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50KSByZXR1cm47XG5cbiAgICBpZiAoY20uc3RhdGUuZm9jdXNlZCkge1xuICAgICAgc2lnbmFsKGNtLCBcImJsdXJcIiwgY20pO1xuICAgICAgY20uc3RhdGUuZm9jdXNlZCA9IGZhbHNlO1xuICAgICAgcm1DbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIFwiQ29kZU1pcnJvci1mb2N1c2VkXCIpO1xuICAgIH1cbiAgICBjbGVhckludGVydmFsKGNtLmRpc3BsYXkuYmxpbmtlcik7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtpZiAoIWNtLnN0YXRlLmZvY3VzZWQpIGNtLmRpc3BsYXkuc2hpZnQgPSBmYWxzZTt9LCAxNTApO1xuICB9XG5cbiAgLy8gQ09OVEVYVCBNRU5VIEhBTkRMSU5HXG5cbiAgLy8gVG8gbWFrZSB0aGUgY29udGV4dCBtZW51IHdvcmssIHdlIG5lZWQgdG8gYnJpZWZseSB1bmhpZGUgdGhlXG4gIC8vIHRleHRhcmVhIChtYWtpbmcgaXQgYXMgdW5vYnRydXNpdmUgYXMgcG9zc2libGUpIHRvIGxldCB0aGVcbiAgLy8gcmlnaHQtY2xpY2sgdGFrZSBlZmZlY3Qgb24gaXQuXG4gIGZ1bmN0aW9uIG9uQ29udGV4dE1lbnUoY20sIGUpIHtcbiAgICBpZiAoZXZlbnRJbldpZGdldChjbS5kaXNwbGF5LCBlKSB8fCBjb250ZXh0TWVudUluR3V0dGVyKGNtLCBlKSkgcmV0dXJuO1xuICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSwgXCJjb250ZXh0bWVudVwiKSkgcmV0dXJuO1xuICAgIGNtLmRpc3BsYXkuaW5wdXQub25Db250ZXh0TWVudShlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbnRleHRNZW51SW5HdXR0ZXIoY20sIGUpIHtcbiAgICBpZiAoIWhhc0hhbmRsZXIoY20sIFwiZ3V0dGVyQ29udGV4dE1lbnVcIikpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gZ3V0dGVyRXZlbnQoY20sIGUsIFwiZ3V0dGVyQ29udGV4dE1lbnVcIiwgZmFsc2UpO1xuICB9XG5cbiAgLy8gVVBEQVRJTkdcblxuICAvLyBDb21wdXRlIHRoZSBwb3NpdGlvbiBvZiB0aGUgZW5kIG9mIGEgY2hhbmdlIChpdHMgJ3RvJyBwcm9wZXJ0eVxuICAvLyByZWZlcnMgdG8gdGhlIHByZS1jaGFuZ2UgZW5kKS5cbiAgdmFyIGNoYW5nZUVuZCA9IENvZGVNaXJyb3IuY2hhbmdlRW5kID0gZnVuY3Rpb24oY2hhbmdlKSB7XG4gICAgaWYgKCFjaGFuZ2UudGV4dCkgcmV0dXJuIGNoYW5nZS50bztcbiAgICByZXR1cm4gUG9zKGNoYW5nZS5mcm9tLmxpbmUgKyBjaGFuZ2UudGV4dC5sZW5ndGggLSAxLFxuICAgICAgICAgICAgICAgbHN0KGNoYW5nZS50ZXh0KS5sZW5ndGggKyAoY2hhbmdlLnRleHQubGVuZ3RoID09IDEgPyBjaGFuZ2UuZnJvbS5jaCA6IDApKTtcbiAgfTtcblxuICAvLyBBZGp1c3QgYSBwb3NpdGlvbiB0byByZWZlciB0byB0aGUgcG9zdC1jaGFuZ2UgcG9zaXRpb24gb2YgdGhlXG4gIC8vIHNhbWUgdGV4dCwgb3IgdGhlIGVuZCBvZiB0aGUgY2hhbmdlIGlmIHRoZSBjaGFuZ2UgY292ZXJzIGl0LlxuICBmdW5jdGlvbiBhZGp1c3RGb3JDaGFuZ2UocG9zLCBjaGFuZ2UpIHtcbiAgICBpZiAoY21wKHBvcywgY2hhbmdlLmZyb20pIDwgMCkgcmV0dXJuIHBvcztcbiAgICBpZiAoY21wKHBvcywgY2hhbmdlLnRvKSA8PSAwKSByZXR1cm4gY2hhbmdlRW5kKGNoYW5nZSk7XG5cbiAgICB2YXIgbGluZSA9IHBvcy5saW5lICsgY2hhbmdlLnRleHQubGVuZ3RoIC0gKGNoYW5nZS50by5saW5lIC0gY2hhbmdlLmZyb20ubGluZSkgLSAxLCBjaCA9IHBvcy5jaDtcbiAgICBpZiAocG9zLmxpbmUgPT0gY2hhbmdlLnRvLmxpbmUpIGNoICs9IGNoYW5nZUVuZChjaGFuZ2UpLmNoIC0gY2hhbmdlLnRvLmNoO1xuICAgIHJldHVybiBQb3MobGluZSwgY2gpO1xuICB9XG5cbiAgZnVuY3Rpb24gY29tcHV0ZVNlbEFmdGVyQ2hhbmdlKGRvYywgY2hhbmdlKSB7XG4gICAgdmFyIG91dCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciByYW5nZSA9IGRvYy5zZWwucmFuZ2VzW2ldO1xuICAgICAgb3V0LnB1c2gobmV3IFJhbmdlKGFkanVzdEZvckNoYW5nZShyYW5nZS5hbmNob3IsIGNoYW5nZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgYWRqdXN0Rm9yQ2hhbmdlKHJhbmdlLmhlYWQsIGNoYW5nZSkpKTtcbiAgICB9XG4gICAgcmV0dXJuIG5vcm1hbGl6ZVNlbGVjdGlvbihvdXQsIGRvYy5zZWwucHJpbUluZGV4KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9mZnNldFBvcyhwb3MsIG9sZCwgbncpIHtcbiAgICBpZiAocG9zLmxpbmUgPT0gb2xkLmxpbmUpXG4gICAgICByZXR1cm4gUG9zKG53LmxpbmUsIHBvcy5jaCAtIG9sZC5jaCArIG53LmNoKTtcbiAgICBlbHNlXG4gICAgICByZXR1cm4gUG9zKG53LmxpbmUgKyAocG9zLmxpbmUgLSBvbGQubGluZSksIHBvcy5jaCk7XG4gIH1cblxuICAvLyBVc2VkIGJ5IHJlcGxhY2VTZWxlY3Rpb25zIHRvIGFsbG93IG1vdmluZyB0aGUgc2VsZWN0aW9uIHRvIHRoZVxuICAvLyBzdGFydCBvciBhcm91bmQgdGhlIHJlcGxhY2VkIHRlc3QuIEhpbnQgbWF5IGJlIFwic3RhcnRcIiBvciBcImFyb3VuZFwiLlxuICBmdW5jdGlvbiBjb21wdXRlUmVwbGFjZWRTZWwoZG9jLCBjaGFuZ2VzLCBoaW50KSB7XG4gICAgdmFyIG91dCA9IFtdO1xuICAgIHZhciBvbGRQcmV2ID0gUG9zKGRvYy5maXJzdCwgMCksIG5ld1ByZXYgPSBvbGRQcmV2O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGNoYW5nZSA9IGNoYW5nZXNbaV07XG4gICAgICB2YXIgZnJvbSA9IG9mZnNldFBvcyhjaGFuZ2UuZnJvbSwgb2xkUHJldiwgbmV3UHJldik7XG4gICAgICB2YXIgdG8gPSBvZmZzZXRQb3MoY2hhbmdlRW5kKGNoYW5nZSksIG9sZFByZXYsIG5ld1ByZXYpO1xuICAgICAgb2xkUHJldiA9IGNoYW5nZS50bztcbiAgICAgIG5ld1ByZXYgPSB0bztcbiAgICAgIGlmIChoaW50ID09IFwiYXJvdW5kXCIpIHtcbiAgICAgICAgdmFyIHJhbmdlID0gZG9jLnNlbC5yYW5nZXNbaV0sIGludiA9IGNtcChyYW5nZS5oZWFkLCByYW5nZS5hbmNob3IpIDwgMDtcbiAgICAgICAgb3V0W2ldID0gbmV3IFJhbmdlKGludiA/IHRvIDogZnJvbSwgaW52ID8gZnJvbSA6IHRvKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dFtpXSA9IG5ldyBSYW5nZShmcm9tLCBmcm9tKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBTZWxlY3Rpb24ob3V0LCBkb2Muc2VsLnByaW1JbmRleCk7XG4gIH1cblxuICAvLyBBbGxvdyBcImJlZm9yZUNoYW5nZVwiIGV2ZW50IGhhbmRsZXJzIHRvIGluZmx1ZW5jZSBhIGNoYW5nZVxuICBmdW5jdGlvbiBmaWx0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UsIHVwZGF0ZSkge1xuICAgIHZhciBvYmogPSB7XG4gICAgICBjYW5jZWxlZDogZmFsc2UsXG4gICAgICBmcm9tOiBjaGFuZ2UuZnJvbSxcbiAgICAgIHRvOiBjaGFuZ2UudG8sXG4gICAgICB0ZXh0OiBjaGFuZ2UudGV4dCxcbiAgICAgIG9yaWdpbjogY2hhbmdlLm9yaWdpbixcbiAgICAgIGNhbmNlbDogZnVuY3Rpb24oKSB7IHRoaXMuY2FuY2VsZWQgPSB0cnVlOyB9XG4gICAgfTtcbiAgICBpZiAodXBkYXRlKSBvYmoudXBkYXRlID0gZnVuY3Rpb24oZnJvbSwgdG8sIHRleHQsIG9yaWdpbikge1xuICAgICAgaWYgKGZyb20pIHRoaXMuZnJvbSA9IGNsaXBQb3MoZG9jLCBmcm9tKTtcbiAgICAgIGlmICh0bykgdGhpcy50byA9IGNsaXBQb3MoZG9jLCB0byk7XG4gICAgICBpZiAodGV4dCkgdGhpcy50ZXh0ID0gdGV4dDtcbiAgICAgIGlmIChvcmlnaW4gIT09IHVuZGVmaW5lZCkgdGhpcy5vcmlnaW4gPSBvcmlnaW47XG4gICAgfTtcbiAgICBzaWduYWwoZG9jLCBcImJlZm9yZUNoYW5nZVwiLCBkb2MsIG9iaik7XG4gICAgaWYgKGRvYy5jbSkgc2lnbmFsKGRvYy5jbSwgXCJiZWZvcmVDaGFuZ2VcIiwgZG9jLmNtLCBvYmopO1xuXG4gICAgaWYgKG9iai5jYW5jZWxlZCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtmcm9tOiBvYmouZnJvbSwgdG86IG9iai50bywgdGV4dDogb2JqLnRleHQsIG9yaWdpbjogb2JqLm9yaWdpbn07XG4gIH1cblxuICAvLyBBcHBseSBhIGNoYW5nZSB0byBhIGRvY3VtZW50LCBhbmQgYWRkIGl0IHRvIHRoZSBkb2N1bWVudCdzXG4gIC8vIGhpc3RvcnksIGFuZCBwcm9wYWdhdGluZyBpdCB0byBhbGwgbGlua2VkIGRvY3VtZW50cy5cbiAgZnVuY3Rpb24gbWFrZUNoYW5nZShkb2MsIGNoYW5nZSwgaWdub3JlUmVhZE9ubHkpIHtcbiAgICBpZiAoZG9jLmNtKSB7XG4gICAgICBpZiAoIWRvYy5jbS5jdXJPcCkgcmV0dXJuIG9wZXJhdGlvbihkb2MuY20sIG1ha2VDaGFuZ2UpKGRvYywgY2hhbmdlLCBpZ25vcmVSZWFkT25seSk7XG4gICAgICBpZiAoZG9jLmNtLnN0YXRlLnN1cHByZXNzRWRpdHMpIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaGFzSGFuZGxlcihkb2MsIFwiYmVmb3JlQ2hhbmdlXCIpIHx8IGRvYy5jbSAmJiBoYXNIYW5kbGVyKGRvYy5jbSwgXCJiZWZvcmVDaGFuZ2VcIikpIHtcbiAgICAgIGNoYW5nZSA9IGZpbHRlckNoYW5nZShkb2MsIGNoYW5nZSwgdHJ1ZSk7XG4gICAgICBpZiAoIWNoYW5nZSkgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFBvc3NpYmx5IHNwbGl0IG9yIHN1cHByZXNzIHRoZSB1cGRhdGUgYmFzZWQgb24gdGhlIHByZXNlbmNlXG4gICAgLy8gb2YgcmVhZC1vbmx5IHNwYW5zIGluIGl0cyByYW5nZS5cbiAgICB2YXIgc3BsaXQgPSBzYXdSZWFkT25seVNwYW5zICYmICFpZ25vcmVSZWFkT25seSAmJiByZW1vdmVSZWFkT25seVJhbmdlcyhkb2MsIGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pO1xuICAgIGlmIChzcGxpdCkge1xuICAgICAgZm9yICh2YXIgaSA9IHNwbGl0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKVxuICAgICAgICBtYWtlQ2hhbmdlSW5uZXIoZG9jLCB7ZnJvbTogc3BsaXRbaV0uZnJvbSwgdG86IHNwbGl0W2ldLnRvLCB0ZXh0OiBpID8gW1wiXCJdIDogY2hhbmdlLnRleHR9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWFrZUNoYW5nZUlubmVyKGRvYywgY2hhbmdlKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBtYWtlQ2hhbmdlSW5uZXIoZG9jLCBjaGFuZ2UpIHtcbiAgICBpZiAoY2hhbmdlLnRleHQubGVuZ3RoID09IDEgJiYgY2hhbmdlLnRleHRbMF0gPT0gXCJcIiAmJiBjbXAoY2hhbmdlLmZyb20sIGNoYW5nZS50bykgPT0gMCkgcmV0dXJuO1xuICAgIHZhciBzZWxBZnRlciA9IGNvbXB1dGVTZWxBZnRlckNoYW5nZShkb2MsIGNoYW5nZSk7XG4gICAgYWRkQ2hhbmdlVG9IaXN0b3J5KGRvYywgY2hhbmdlLCBzZWxBZnRlciwgZG9jLmNtID8gZG9jLmNtLmN1ck9wLmlkIDogTmFOKTtcblxuICAgIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIHNlbEFmdGVyLCBzdHJldGNoU3BhbnNPdmVyQ2hhbmdlKGRvYywgY2hhbmdlKSk7XG4gICAgdmFyIHJlYmFzZWQgPSBbXTtcblxuICAgIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbihkb2MsIHNoYXJlZEhpc3QpIHtcbiAgICAgIGlmICghc2hhcmVkSGlzdCAmJiBpbmRleE9mKHJlYmFzZWQsIGRvYy5oaXN0b3J5KSA9PSAtMSkge1xuICAgICAgICByZWJhc2VIaXN0KGRvYy5oaXN0b3J5LCBjaGFuZ2UpO1xuICAgICAgICByZWJhc2VkLnB1c2goZG9jLmhpc3RvcnkpO1xuICAgICAgfVxuICAgICAgbWFrZUNoYW5nZVNpbmdsZURvYyhkb2MsIGNoYW5nZSwgbnVsbCwgc3RyZXRjaFNwYW5zT3ZlckNoYW5nZShkb2MsIGNoYW5nZSkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmV2ZXJ0IGEgY2hhbmdlIHN0b3JlZCBpbiBhIGRvY3VtZW50J3MgaGlzdG9yeS5cbiAgZnVuY3Rpb24gbWFrZUNoYW5nZUZyb21IaXN0b3J5KGRvYywgdHlwZSwgYWxsb3dTZWxlY3Rpb25Pbmx5KSB7XG4gICAgaWYgKGRvYy5jbSAmJiBkb2MuY20uc3RhdGUuc3VwcHJlc3NFZGl0cykgcmV0dXJuO1xuXG4gICAgdmFyIGhpc3QgPSBkb2MuaGlzdG9yeSwgZXZlbnQsIHNlbEFmdGVyID0gZG9jLnNlbDtcbiAgICB2YXIgc291cmNlID0gdHlwZSA9PSBcInVuZG9cIiA/IGhpc3QuZG9uZSA6IGhpc3QudW5kb25lLCBkZXN0ID0gdHlwZSA9PSBcInVuZG9cIiA/IGhpc3QudW5kb25lIDogaGlzdC5kb25lO1xuXG4gICAgLy8gVmVyaWZ5IHRoYXQgdGhlcmUgaXMgYSB1c2VhYmxlIGV2ZW50IChzbyB0aGF0IGN0cmwteiB3b24ndFxuICAgIC8vIG5lZWRsZXNzbHkgY2xlYXIgc2VsZWN0aW9uIGV2ZW50cylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNvdXJjZS5sZW5ndGg7IGkrKykge1xuICAgICAgZXZlbnQgPSBzb3VyY2VbaV07XG4gICAgICBpZiAoYWxsb3dTZWxlY3Rpb25Pbmx5ID8gZXZlbnQucmFuZ2VzICYmICFldmVudC5lcXVhbHMoZG9jLnNlbCkgOiAhZXZlbnQucmFuZ2VzKVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKGkgPT0gc291cmNlLmxlbmd0aCkgcmV0dXJuO1xuICAgIGhpc3QubGFzdE9yaWdpbiA9IGhpc3QubGFzdFNlbE9yaWdpbiA9IG51bGw7XG5cbiAgICBmb3IgKDs7KSB7XG4gICAgICBldmVudCA9IHNvdXJjZS5wb3AoKTtcbiAgICAgIGlmIChldmVudC5yYW5nZXMpIHtcbiAgICAgICAgcHVzaFNlbGVjdGlvblRvSGlzdG9yeShldmVudCwgZGVzdCk7XG4gICAgICAgIGlmIChhbGxvd1NlbGVjdGlvbk9ubHkgJiYgIWV2ZW50LmVxdWFscyhkb2Muc2VsKSkge1xuICAgICAgICAgIHNldFNlbGVjdGlvbihkb2MsIGV2ZW50LCB7Y2xlYXJSZWRvOiBmYWxzZX0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBzZWxBZnRlciA9IGV2ZW50O1xuICAgICAgfVxuICAgICAgZWxzZSBicmVhaztcbiAgICB9XG5cbiAgICAvLyBCdWlsZCB1cCBhIHJldmVyc2UgY2hhbmdlIG9iamVjdCB0byBhZGQgdG8gdGhlIG9wcG9zaXRlIGhpc3RvcnlcbiAgICAvLyBzdGFjayAocmVkbyB3aGVuIHVuZG9pbmcsIGFuZCB2aWNlIHZlcnNhKS5cbiAgICB2YXIgYW50aUNoYW5nZXMgPSBbXTtcbiAgICBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KHNlbEFmdGVyLCBkZXN0KTtcbiAgICBkZXN0LnB1c2goe2NoYW5nZXM6IGFudGlDaGFuZ2VzLCBnZW5lcmF0aW9uOiBoaXN0LmdlbmVyYXRpb259KTtcbiAgICBoaXN0LmdlbmVyYXRpb24gPSBldmVudC5nZW5lcmF0aW9uIHx8ICsraGlzdC5tYXhHZW5lcmF0aW9uO1xuXG4gICAgdmFyIGZpbHRlciA9IGhhc0hhbmRsZXIoZG9jLCBcImJlZm9yZUNoYW5nZVwiKSB8fCBkb2MuY20gJiYgaGFzSGFuZGxlcihkb2MuY20sIFwiYmVmb3JlQ2hhbmdlXCIpO1xuXG4gICAgZm9yICh2YXIgaSA9IGV2ZW50LmNoYW5nZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgIHZhciBjaGFuZ2UgPSBldmVudC5jaGFuZ2VzW2ldO1xuICAgICAgY2hhbmdlLm9yaWdpbiA9IHR5cGU7XG4gICAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UsIGZhbHNlKSkge1xuICAgICAgICBzb3VyY2UubGVuZ3RoID0gMDtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBhbnRpQ2hhbmdlcy5wdXNoKGhpc3RvcnlDaGFuZ2VGcm9tQ2hhbmdlKGRvYywgY2hhbmdlKSk7XG5cbiAgICAgIHZhciBhZnRlciA9IGkgPyBjb21wdXRlU2VsQWZ0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpIDogbHN0KHNvdXJjZSk7XG4gICAgICBtYWtlQ2hhbmdlU2luZ2xlRG9jKGRvYywgY2hhbmdlLCBhZnRlciwgbWVyZ2VPbGRTcGFucyhkb2MsIGNoYW5nZSkpO1xuICAgICAgaWYgKCFpICYmIGRvYy5jbSkgZG9jLmNtLnNjcm9sbEludG9WaWV3KHtmcm9tOiBjaGFuZ2UuZnJvbSwgdG86IGNoYW5nZUVuZChjaGFuZ2UpfSk7XG4gICAgICB2YXIgcmViYXNlZCA9IFtdO1xuXG4gICAgICAvLyBQcm9wYWdhdGUgdG8gdGhlIGxpbmtlZCBkb2N1bWVudHNcbiAgICAgIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbihkb2MsIHNoYXJlZEhpc3QpIHtcbiAgICAgICAgaWYgKCFzaGFyZWRIaXN0ICYmIGluZGV4T2YocmViYXNlZCwgZG9jLmhpc3RvcnkpID09IC0xKSB7XG4gICAgICAgICAgcmViYXNlSGlzdChkb2MuaGlzdG9yeSwgY2hhbmdlKTtcbiAgICAgICAgICByZWJhc2VkLnB1c2goZG9jLmhpc3RvcnkpO1xuICAgICAgICB9XG4gICAgICAgIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIG51bGwsIG1lcmdlT2xkU3BhbnMoZG9jLCBjaGFuZ2UpKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIFN1Yi12aWV3cyBuZWVkIHRoZWlyIGxpbmUgbnVtYmVycyBzaGlmdGVkIHdoZW4gdGV4dCBpcyBhZGRlZFxuICAvLyBhYm92ZSBvciBiZWxvdyB0aGVtIGluIHRoZSBwYXJlbnQgZG9jdW1lbnQuXG4gIGZ1bmN0aW9uIHNoaWZ0RG9jKGRvYywgZGlzdGFuY2UpIHtcbiAgICBpZiAoZGlzdGFuY2UgPT0gMCkgcmV0dXJuO1xuICAgIGRvYy5maXJzdCArPSBkaXN0YW5jZTtcbiAgICBkb2Muc2VsID0gbmV3IFNlbGVjdGlvbihtYXAoZG9jLnNlbC5yYW5nZXMsIGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICByZXR1cm4gbmV3IFJhbmdlKFBvcyhyYW5nZS5hbmNob3IubGluZSArIGRpc3RhbmNlLCByYW5nZS5hbmNob3IuY2gpLFxuICAgICAgICAgICAgICAgICAgICAgICBQb3MocmFuZ2UuaGVhZC5saW5lICsgZGlzdGFuY2UsIHJhbmdlLmhlYWQuY2gpKTtcbiAgICB9KSwgZG9jLnNlbC5wcmltSW5kZXgpO1xuICAgIGlmIChkb2MuY20pIHtcbiAgICAgIHJlZ0NoYW5nZShkb2MuY20sIGRvYy5maXJzdCwgZG9jLmZpcnN0IC0gZGlzdGFuY2UsIGRpc3RhbmNlKTtcbiAgICAgIGZvciAodmFyIGQgPSBkb2MuY20uZGlzcGxheSwgbCA9IGQudmlld0Zyb207IGwgPCBkLnZpZXdUbzsgbCsrKVxuICAgICAgICByZWdMaW5lQ2hhbmdlKGRvYy5jbSwgbCwgXCJndXR0ZXJcIik7XG4gICAgfVxuICB9XG5cbiAgLy8gTW9yZSBsb3dlci1sZXZlbCBjaGFuZ2UgZnVuY3Rpb24sIGhhbmRsaW5nIG9ubHkgYSBzaW5nbGUgZG9jdW1lbnRcbiAgLy8gKG5vdCBsaW5rZWQgb25lcykuXG4gIGZ1bmN0aW9uIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIHNlbEFmdGVyLCBzcGFucykge1xuICAgIGlmIChkb2MuY20gJiYgIWRvYy5jbS5jdXJPcClcbiAgICAgIHJldHVybiBvcGVyYXRpb24oZG9jLmNtLCBtYWtlQ2hhbmdlU2luZ2xlRG9jKShkb2MsIGNoYW5nZSwgc2VsQWZ0ZXIsIHNwYW5zKTtcblxuICAgIGlmIChjaGFuZ2UudG8ubGluZSA8IGRvYy5maXJzdCkge1xuICAgICAgc2hpZnREb2MoZG9jLCBjaGFuZ2UudGV4dC5sZW5ndGggLSAxIC0gKGNoYW5nZS50by5saW5lIC0gY2hhbmdlLmZyb20ubGluZSkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoY2hhbmdlLmZyb20ubGluZSA+IGRvYy5sYXN0TGluZSgpKSByZXR1cm47XG5cbiAgICAvLyBDbGlwIHRoZSBjaGFuZ2UgdG8gdGhlIHNpemUgb2YgdGhpcyBkb2NcbiAgICBpZiAoY2hhbmdlLmZyb20ubGluZSA8IGRvYy5maXJzdCkge1xuICAgICAgdmFyIHNoaWZ0ID0gY2hhbmdlLnRleHQubGVuZ3RoIC0gMSAtIChkb2MuZmlyc3QgLSBjaGFuZ2UuZnJvbS5saW5lKTtcbiAgICAgIHNoaWZ0RG9jKGRvYywgc2hpZnQpO1xuICAgICAgY2hhbmdlID0ge2Zyb206IFBvcyhkb2MuZmlyc3QsIDApLCB0bzogUG9zKGNoYW5nZS50by5saW5lICsgc2hpZnQsIGNoYW5nZS50by5jaCksXG4gICAgICAgICAgICAgICAgdGV4dDogW2xzdChjaGFuZ2UudGV4dCldLCBvcmlnaW46IGNoYW5nZS5vcmlnaW59O1xuICAgIH1cbiAgICB2YXIgbGFzdCA9IGRvYy5sYXN0TGluZSgpO1xuICAgIGlmIChjaGFuZ2UudG8ubGluZSA+IGxhc3QpIHtcbiAgICAgIGNoYW5nZSA9IHtmcm9tOiBjaGFuZ2UuZnJvbSwgdG86IFBvcyhsYXN0LCBnZXRMaW5lKGRvYywgbGFzdCkudGV4dC5sZW5ndGgpLFxuICAgICAgICAgICAgICAgIHRleHQ6IFtjaGFuZ2UudGV4dFswXV0sIG9yaWdpbjogY2hhbmdlLm9yaWdpbn07XG4gICAgfVxuXG4gICAgY2hhbmdlLnJlbW92ZWQgPSBnZXRCZXR3ZWVuKGRvYywgY2hhbmdlLmZyb20sIGNoYW5nZS50byk7XG5cbiAgICBpZiAoIXNlbEFmdGVyKSBzZWxBZnRlciA9IGNvbXB1dGVTZWxBZnRlckNoYW5nZShkb2MsIGNoYW5nZSk7XG4gICAgaWYgKGRvYy5jbSkgbWFrZUNoYW5nZVNpbmdsZURvY0luRWRpdG9yKGRvYy5jbSwgY2hhbmdlLCBzcGFucyk7XG4gICAgZWxzZSB1cGRhdGVEb2MoZG9jLCBjaGFuZ2UsIHNwYW5zKTtcbiAgICBzZXRTZWxlY3Rpb25Ob1VuZG8oZG9jLCBzZWxBZnRlciwgc2VsX2RvbnRTY3JvbGwpO1xuICB9XG5cbiAgLy8gSGFuZGxlIHRoZSBpbnRlcmFjdGlvbiBvZiBhIGNoYW5nZSB0byBhIGRvY3VtZW50IHdpdGggdGhlIGVkaXRvclxuICAvLyB0aGF0IHRoaXMgZG9jdW1lbnQgaXMgcGFydCBvZi5cbiAgZnVuY3Rpb24gbWFrZUNoYW5nZVNpbmdsZURvY0luRWRpdG9yKGNtLCBjaGFuZ2UsIHNwYW5zKSB7XG4gICAgdmFyIGRvYyA9IGNtLmRvYywgZGlzcGxheSA9IGNtLmRpc3BsYXksIGZyb20gPSBjaGFuZ2UuZnJvbSwgdG8gPSBjaGFuZ2UudG87XG5cbiAgICB2YXIgcmVjb21wdXRlTWF4TGVuZ3RoID0gZmFsc2UsIGNoZWNrV2lkdGhTdGFydCA9IGZyb20ubGluZTtcbiAgICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7XG4gICAgICBjaGVja1dpZHRoU3RhcnQgPSBsaW5lTm8odmlzdWFsTGluZShnZXRMaW5lKGRvYywgZnJvbS5saW5lKSkpO1xuICAgICAgZG9jLml0ZXIoY2hlY2tXaWR0aFN0YXJ0LCB0by5saW5lICsgMSwgZnVuY3Rpb24obGluZSkge1xuICAgICAgICBpZiAobGluZSA9PSBkaXNwbGF5Lm1heExpbmUpIHtcbiAgICAgICAgICByZWNvbXB1dGVNYXhMZW5ndGggPSB0cnVlO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoZG9jLnNlbC5jb250YWlucyhjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKSA+IC0xKVxuICAgICAgc2lnbmFsQ3Vyc29yQWN0aXZpdHkoY20pO1xuXG4gICAgdXBkYXRlRG9jKGRvYywgY2hhbmdlLCBzcGFucywgZXN0aW1hdGVIZWlnaHQoY20pKTtcblxuICAgIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICAgIGRvYy5pdGVyKGNoZWNrV2lkdGhTdGFydCwgZnJvbS5saW5lICsgY2hhbmdlLnRleHQubGVuZ3RoLCBmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgIHZhciBsZW4gPSBsaW5lTGVuZ3RoKGxpbmUpO1xuICAgICAgICBpZiAobGVuID4gZGlzcGxheS5tYXhMaW5lTGVuZ3RoKSB7XG4gICAgICAgICAgZGlzcGxheS5tYXhMaW5lID0gbGluZTtcbiAgICAgICAgICBkaXNwbGF5Lm1heExpbmVMZW5ndGggPSBsZW47XG4gICAgICAgICAgZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgcmVjb21wdXRlTWF4TGVuZ3RoID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKHJlY29tcHV0ZU1heExlbmd0aCkgY20uY3VyT3AudXBkYXRlTWF4TGluZSA9IHRydWU7XG4gICAgfVxuXG4gICAgLy8gQWRqdXN0IGZyb250aWVyLCBzY2hlZHVsZSB3b3JrZXJcbiAgICBkb2MuZnJvbnRpZXIgPSBNYXRoLm1pbihkb2MuZnJvbnRpZXIsIGZyb20ubGluZSk7XG4gICAgc3RhcnRXb3JrZXIoY20sIDQwMCk7XG5cbiAgICB2YXIgbGVuZGlmZiA9IGNoYW5nZS50ZXh0Lmxlbmd0aCAtICh0by5saW5lIC0gZnJvbS5saW5lKSAtIDE7XG4gICAgLy8gUmVtZW1iZXIgdGhhdCB0aGVzZSBsaW5lcyBjaGFuZ2VkLCBmb3IgdXBkYXRpbmcgdGhlIGRpc3BsYXlcbiAgICBpZiAoY2hhbmdlLmZ1bGwpXG4gICAgICByZWdDaGFuZ2UoY20pO1xuICAgIGVsc2UgaWYgKGZyb20ubGluZSA9PSB0by5saW5lICYmIGNoYW5nZS50ZXh0Lmxlbmd0aCA9PSAxICYmICFpc1dob2xlTGluZVVwZGF0ZShjbS5kb2MsIGNoYW5nZSkpXG4gICAgICByZWdMaW5lQ2hhbmdlKGNtLCBmcm9tLmxpbmUsIFwidGV4dFwiKTtcbiAgICBlbHNlXG4gICAgICByZWdDaGFuZ2UoY20sIGZyb20ubGluZSwgdG8ubGluZSArIDEsIGxlbmRpZmYpO1xuXG4gICAgdmFyIGNoYW5nZXNIYW5kbGVyID0gaGFzSGFuZGxlcihjbSwgXCJjaGFuZ2VzXCIpLCBjaGFuZ2VIYW5kbGVyID0gaGFzSGFuZGxlcihjbSwgXCJjaGFuZ2VcIik7XG4gICAgaWYgKGNoYW5nZUhhbmRsZXIgfHwgY2hhbmdlc0hhbmRsZXIpIHtcbiAgICAgIHZhciBvYmogPSB7XG4gICAgICAgIGZyb206IGZyb20sIHRvOiB0byxcbiAgICAgICAgdGV4dDogY2hhbmdlLnRleHQsXG4gICAgICAgIHJlbW92ZWQ6IGNoYW5nZS5yZW1vdmVkLFxuICAgICAgICBvcmlnaW46IGNoYW5nZS5vcmlnaW5cbiAgICAgIH07XG4gICAgICBpZiAoY2hhbmdlSGFuZGxlcikgc2lnbmFsTGF0ZXIoY20sIFwiY2hhbmdlXCIsIGNtLCBvYmopO1xuICAgICAgaWYgKGNoYW5nZXNIYW5kbGVyKSAoY20uY3VyT3AuY2hhbmdlT2JqcyB8fCAoY20uY3VyT3AuY2hhbmdlT2JqcyA9IFtdKSkucHVzaChvYmopO1xuICAgIH1cbiAgICBjbS5kaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ID0gbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlcGxhY2VSYW5nZShkb2MsIGNvZGUsIGZyb20sIHRvLCBvcmlnaW4pIHtcbiAgICBpZiAoIXRvKSB0byA9IGZyb207XG4gICAgaWYgKGNtcCh0bywgZnJvbSkgPCAwKSB7IHZhciB0bXAgPSB0bzsgdG8gPSBmcm9tOyBmcm9tID0gdG1wOyB9XG4gICAgaWYgKHR5cGVvZiBjb2RlID09IFwic3RyaW5nXCIpIGNvZGUgPSBkb2Muc3BsaXRMaW5lcyhjb2RlKTtcbiAgICBtYWtlQ2hhbmdlKGRvYywge2Zyb206IGZyb20sIHRvOiB0bywgdGV4dDogY29kZSwgb3JpZ2luOiBvcmlnaW59KTtcbiAgfVxuXG4gIC8vIFNDUk9MTElORyBUSElOR1MgSU5UTyBWSUVXXG5cbiAgLy8gSWYgYW4gZWRpdG9yIHNpdHMgb24gdGhlIHRvcCBvciBib3R0b20gb2YgdGhlIHdpbmRvdywgcGFydGlhbGx5XG4gIC8vIHNjcm9sbGVkIG91dCBvZiB2aWV3LCB0aGlzIGVuc3VyZXMgdGhhdCB0aGUgY3Vyc29yIGlzIHZpc2libGUuXG4gIGZ1bmN0aW9uIG1heWJlU2Nyb2xsV2luZG93KGNtLCBjb29yZHMpIHtcbiAgICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIFwic2Nyb2xsQ3Vyc29ySW50b1ZpZXdcIikpIHJldHVybjtcblxuICAgIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgYm94ID0gZGlzcGxheS5zaXplci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgZG9TY3JvbGwgPSBudWxsO1xuICAgIGlmIChjb29yZHMudG9wICsgYm94LnRvcCA8IDApIGRvU2Nyb2xsID0gdHJ1ZTtcbiAgICBlbHNlIGlmIChjb29yZHMuYm90dG9tICsgYm94LnRvcCA+ICh3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkpIGRvU2Nyb2xsID0gZmFsc2U7XG4gICAgaWYgKGRvU2Nyb2xsICE9IG51bGwgJiYgIXBoYW50b20pIHtcbiAgICAgIHZhciBzY3JvbGxOb2RlID0gZWx0KFwiZGl2XCIsIFwiXFx1MjAwYlwiLCBudWxsLCBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAoY29vcmRzLnRvcCAtIGRpc3BsYXkudmlld09mZnNldCAtIHBhZGRpbmdUb3AoY20uZGlzcGxheSkpICsgXCJweDsgaGVpZ2h0OiBcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAoY29vcmRzLmJvdHRvbSAtIGNvb3Jkcy50b3AgKyBzY3JvbGxHYXAoY20pICsgZGlzcGxheS5iYXJIZWlnaHQpICsgXCJweDsgbGVmdDogXCIgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgY29vcmRzLmxlZnQgKyBcInB4OyB3aWR0aDogMnB4O1wiKTtcbiAgICAgIGNtLmRpc3BsYXkubGluZVNwYWNlLmFwcGVuZENoaWxkKHNjcm9sbE5vZGUpO1xuICAgICAgc2Nyb2xsTm9kZS5zY3JvbGxJbnRvVmlldyhkb1Njcm9sbCk7XG4gICAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5yZW1vdmVDaGlsZChzY3JvbGxOb2RlKTtcbiAgICB9XG4gIH1cblxuICAvLyBTY3JvbGwgYSBnaXZlbiBwb3NpdGlvbiBpbnRvIHZpZXcgKGltbWVkaWF0ZWx5KSwgdmVyaWZ5aW5nIHRoYXRcbiAgLy8gaXQgYWN0dWFsbHkgYmVjYW1lIHZpc2libGUgKGFzIGxpbmUgaGVpZ2h0cyBhcmUgYWNjdXJhdGVseVxuICAvLyBtZWFzdXJlZCwgdGhlIHBvc2l0aW9uIG9mIHNvbWV0aGluZyBtYXkgJ2RyaWZ0JyBkdXJpbmcgZHJhd2luZykuXG4gIGZ1bmN0aW9uIHNjcm9sbFBvc0ludG9WaWV3KGNtLCBwb3MsIGVuZCwgbWFyZ2luKSB7XG4gICAgaWYgKG1hcmdpbiA9PSBudWxsKSBtYXJnaW4gPSAwO1xuICAgIGZvciAodmFyIGxpbWl0ID0gMDsgbGltaXQgPCA1OyBsaW1pdCsrKSB7XG4gICAgICB2YXIgY2hhbmdlZCA9IGZhbHNlLCBjb29yZHMgPSBjdXJzb3JDb29yZHMoY20sIHBvcyk7XG4gICAgICB2YXIgZW5kQ29vcmRzID0gIWVuZCB8fCBlbmQgPT0gcG9zID8gY29vcmRzIDogY3Vyc29yQ29vcmRzKGNtLCBlbmQpO1xuICAgICAgdmFyIHNjcm9sbFBvcyA9IGNhbGN1bGF0ZVNjcm9sbFBvcyhjbSwgTWF0aC5taW4oY29vcmRzLmxlZnQsIGVuZENvb3Jkcy5sZWZ0KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5taW4oY29vcmRzLnRvcCwgZW5kQ29vcmRzLnRvcCkgLSBtYXJnaW4sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE1hdGgubWF4KGNvb3Jkcy5sZWZ0LCBlbmRDb29yZHMubGVmdCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE1hdGgubWF4KGNvb3Jkcy5ib3R0b20sIGVuZENvb3Jkcy5ib3R0b20pICsgbWFyZ2luKTtcbiAgICAgIHZhciBzdGFydFRvcCA9IGNtLmRvYy5zY3JvbGxUb3AsIHN0YXJ0TGVmdCA9IGNtLmRvYy5zY3JvbGxMZWZ0O1xuICAgICAgaWYgKHNjcm9sbFBvcy5zY3JvbGxUb3AgIT0gbnVsbCkge1xuICAgICAgICBzZXRTY3JvbGxUb3AoY20sIHNjcm9sbFBvcy5zY3JvbGxUb3ApO1xuICAgICAgICBpZiAoTWF0aC5hYnMoY20uZG9jLnNjcm9sbFRvcCAtIHN0YXJ0VG9wKSA+IDEpIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKHNjcm9sbFBvcy5zY3JvbGxMZWZ0ICE9IG51bGwpIHtcbiAgICAgICAgc2V0U2Nyb2xsTGVmdChjbSwgc2Nyb2xsUG9zLnNjcm9sbExlZnQpO1xuICAgICAgICBpZiAoTWF0aC5hYnMoY20uZG9jLnNjcm9sbExlZnQgLSBzdGFydExlZnQpID4gMSkgY2hhbmdlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICBpZiAoIWNoYW5nZWQpIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gY29vcmRzO1xuICB9XG5cbiAgLy8gU2Nyb2xsIGEgZ2l2ZW4gc2V0IG9mIGNvb3JkaW5hdGVzIGludG8gdmlldyAoaW1tZWRpYXRlbHkpLlxuICBmdW5jdGlvbiBzY3JvbGxJbnRvVmlldyhjbSwgeDEsIHkxLCB4MiwgeTIpIHtcbiAgICB2YXIgc2Nyb2xsUG9zID0gY2FsY3VsYXRlU2Nyb2xsUG9zKGNtLCB4MSwgeTEsIHgyLCB5Mik7XG4gICAgaWYgKHNjcm9sbFBvcy5zY3JvbGxUb3AgIT0gbnVsbCkgc2V0U2Nyb2xsVG9wKGNtLCBzY3JvbGxQb3Muc2Nyb2xsVG9wKTtcbiAgICBpZiAoc2Nyb2xsUG9zLnNjcm9sbExlZnQgIT0gbnVsbCkgc2V0U2Nyb2xsTGVmdChjbSwgc2Nyb2xsUG9zLnNjcm9sbExlZnQpO1xuICB9XG5cbiAgLy8gQ2FsY3VsYXRlIGEgbmV3IHNjcm9sbCBwb3NpdGlvbiBuZWVkZWQgdG8gc2Nyb2xsIHRoZSBnaXZlblxuICAvLyByZWN0YW5nbGUgaW50byB2aWV3LiBSZXR1cm5zIGFuIG9iamVjdCB3aXRoIHNjcm9sbFRvcCBhbmRcbiAgLy8gc2Nyb2xsTGVmdCBwcm9wZXJ0aWVzLiBXaGVuIHRoZXNlIGFyZSB1bmRlZmluZWQsIHRoZVxuICAvLyB2ZXJ0aWNhbC9ob3Jpem9udGFsIHBvc2l0aW9uIGRvZXMgbm90IG5lZWQgdG8gYmUgYWRqdXN0ZWQuXG4gIGZ1bmN0aW9uIGNhbGN1bGF0ZVNjcm9sbFBvcyhjbSwgeDEsIHkxLCB4MiwgeTIpIHtcbiAgICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIHNuYXBNYXJnaW4gPSB0ZXh0SGVpZ2h0KGNtLmRpc3BsYXkpO1xuICAgIGlmICh5MSA8IDApIHkxID0gMDtcbiAgICB2YXIgc2NyZWVudG9wID0gY20uY3VyT3AgJiYgY20uY3VyT3Auc2Nyb2xsVG9wICE9IG51bGwgPyBjbS5jdXJPcC5zY3JvbGxUb3AgOiBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcDtcbiAgICB2YXIgc2NyZWVuID0gZGlzcGxheUhlaWdodChjbSksIHJlc3VsdCA9IHt9O1xuICAgIGlmICh5MiAtIHkxID4gc2NyZWVuKSB5MiA9IHkxICsgc2NyZWVuO1xuICAgIHZhciBkb2NCb3R0b20gPSBjbS5kb2MuaGVpZ2h0ICsgcGFkZGluZ1ZlcnQoZGlzcGxheSk7XG4gICAgdmFyIGF0VG9wID0geTEgPCBzbmFwTWFyZ2luLCBhdEJvdHRvbSA9IHkyID4gZG9jQm90dG9tIC0gc25hcE1hcmdpbjtcbiAgICBpZiAoeTEgPCBzY3JlZW50b3ApIHtcbiAgICAgIHJlc3VsdC5zY3JvbGxUb3AgPSBhdFRvcCA/IDAgOiB5MTtcbiAgICB9IGVsc2UgaWYgKHkyID4gc2NyZWVudG9wICsgc2NyZWVuKSB7XG4gICAgICB2YXIgbmV3VG9wID0gTWF0aC5taW4oeTEsIChhdEJvdHRvbSA/IGRvY0JvdHRvbSA6IHkyKSAtIHNjcmVlbik7XG4gICAgICBpZiAobmV3VG9wICE9IHNjcmVlbnRvcCkgcmVzdWx0LnNjcm9sbFRvcCA9IG5ld1RvcDtcbiAgICB9XG5cbiAgICB2YXIgc2NyZWVubGVmdCA9IGNtLmN1ck9wICYmIGNtLmN1ck9wLnNjcm9sbExlZnQgIT0gbnVsbCA/IGNtLmN1ck9wLnNjcm9sbExlZnQgOiBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQ7XG4gICAgdmFyIHNjcmVlbncgPSBkaXNwbGF5V2lkdGgoY20pIC0gKGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIgPyBkaXNwbGF5Lmd1dHRlcnMub2Zmc2V0V2lkdGggOiAwKTtcbiAgICB2YXIgdG9vV2lkZSA9IHgyIC0geDEgPiBzY3JlZW53O1xuICAgIGlmICh0b29XaWRlKSB4MiA9IHgxICsgc2NyZWVudztcbiAgICBpZiAoeDEgPCAxMClcbiAgICAgIHJlc3VsdC5zY3JvbGxMZWZ0ID0gMDtcbiAgICBlbHNlIGlmICh4MSA8IHNjcmVlbmxlZnQpXG4gICAgICByZXN1bHQuc2Nyb2xsTGVmdCA9IE1hdGgubWF4KDAsIHgxIC0gKHRvb1dpZGUgPyAwIDogMTApKTtcbiAgICBlbHNlIGlmICh4MiA+IHNjcmVlbncgKyBzY3JlZW5sZWZ0IC0gMylcbiAgICAgIHJlc3VsdC5zY3JvbGxMZWZ0ID0geDIgKyAodG9vV2lkZSA/IDAgOiAxMCkgLSBzY3JlZW53O1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBTdG9yZSBhIHJlbGF0aXZlIGFkanVzdG1lbnQgdG8gdGhlIHNjcm9sbCBwb3NpdGlvbiBpbiB0aGUgY3VycmVudFxuICAvLyBvcGVyYXRpb24gKHRvIGJlIGFwcGxpZWQgd2hlbiB0aGUgb3BlcmF0aW9uIGZpbmlzaGVzKS5cbiAgZnVuY3Rpb24gYWRkVG9TY3JvbGxQb3MoY20sIGxlZnQsIHRvcCkge1xuICAgIGlmIChsZWZ0ICE9IG51bGwgfHwgdG9wICE9IG51bGwpIHJlc29sdmVTY3JvbGxUb1BvcyhjbSk7XG4gICAgaWYgKGxlZnQgIT0gbnVsbClcbiAgICAgIGNtLmN1ck9wLnNjcm9sbExlZnQgPSAoY20uY3VyT3Auc2Nyb2xsTGVmdCA9PSBudWxsID8gY20uZG9jLnNjcm9sbExlZnQgOiBjbS5jdXJPcC5zY3JvbGxMZWZ0KSArIGxlZnQ7XG4gICAgaWYgKHRvcCAhPSBudWxsKVxuICAgICAgY20uY3VyT3Auc2Nyb2xsVG9wID0gKGNtLmN1ck9wLnNjcm9sbFRvcCA9PSBudWxsID8gY20uZG9jLnNjcm9sbFRvcCA6IGNtLmN1ck9wLnNjcm9sbFRvcCkgKyB0b3A7XG4gIH1cblxuICAvLyBNYWtlIHN1cmUgdGhhdCBhdCB0aGUgZW5kIG9mIHRoZSBvcGVyYXRpb24gdGhlIGN1cnJlbnQgY3Vyc29yIGlzXG4gIC8vIHNob3duLlxuICBmdW5jdGlvbiBlbnN1cmVDdXJzb3JWaXNpYmxlKGNtKSB7XG4gICAgcmVzb2x2ZVNjcm9sbFRvUG9zKGNtKTtcbiAgICB2YXIgY3VyID0gY20uZ2V0Q3Vyc29yKCksIGZyb20gPSBjdXIsIHRvID0gY3VyO1xuICAgIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICAgIGZyb20gPSBjdXIuY2ggPyBQb3MoY3VyLmxpbmUsIGN1ci5jaCAtIDEpIDogY3VyO1xuICAgICAgdG8gPSBQb3MoY3VyLmxpbmUsIGN1ci5jaCArIDEpO1xuICAgIH1cbiAgICBjbS5jdXJPcC5zY3JvbGxUb1BvcyA9IHtmcm9tOiBmcm9tLCB0bzogdG8sIG1hcmdpbjogY20ub3B0aW9ucy5jdXJzb3JTY3JvbGxNYXJnaW4sIGlzQ3Vyc29yOiB0cnVlfTtcbiAgfVxuXG4gIC8vIFdoZW4gYW4gb3BlcmF0aW9uIGhhcyBpdHMgc2Nyb2xsVG9Qb3MgcHJvcGVydHkgc2V0LCBhbmQgYW5vdGhlclxuICAvLyBzY3JvbGwgYWN0aW9uIGlzIGFwcGxpZWQgYmVmb3JlIHRoZSBlbmQgb2YgdGhlIG9wZXJhdGlvbiwgdGhpc1xuICAvLyAnc2ltdWxhdGVzJyBzY3JvbGxpbmcgdGhhdCBwb3NpdGlvbiBpbnRvIHZpZXcgaW4gYSBjaGVhcCB3YXksIHNvXG4gIC8vIHRoYXQgdGhlIGVmZmVjdCBvZiBpbnRlcm1lZGlhdGUgc2Nyb2xsIGNvbW1hbmRzIGlzIG5vdCBpZ25vcmVkLlxuICBmdW5jdGlvbiByZXNvbHZlU2Nyb2xsVG9Qb3MoY20pIHtcbiAgICB2YXIgcmFuZ2UgPSBjbS5jdXJPcC5zY3JvbGxUb1BvcztcbiAgICBpZiAocmFuZ2UpIHtcbiAgICAgIGNtLmN1ck9wLnNjcm9sbFRvUG9zID0gbnVsbDtcbiAgICAgIHZhciBmcm9tID0gZXN0aW1hdGVDb29yZHMoY20sIHJhbmdlLmZyb20pLCB0byA9IGVzdGltYXRlQ29vcmRzKGNtLCByYW5nZS50byk7XG4gICAgICB2YXIgc1BvcyA9IGNhbGN1bGF0ZVNjcm9sbFBvcyhjbSwgTWF0aC5taW4oZnJvbS5sZWZ0LCB0by5sZWZ0KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE1hdGgubWluKGZyb20udG9wLCB0by50b3ApIC0gcmFuZ2UubWFyZ2luLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5tYXgoZnJvbS5yaWdodCwgdG8ucmlnaHQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5tYXgoZnJvbS5ib3R0b20sIHRvLmJvdHRvbSkgKyByYW5nZS5tYXJnaW4pO1xuICAgICAgY20uc2Nyb2xsVG8oc1Bvcy5zY3JvbGxMZWZ0LCBzUG9zLnNjcm9sbFRvcCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQVBJIFVUSUxJVElFU1xuXG4gIC8vIEluZGVudCB0aGUgZ2l2ZW4gbGluZS4gVGhlIGhvdyBwYXJhbWV0ZXIgY2FuIGJlIFwic21hcnRcIixcbiAgLy8gXCJhZGRcIi9udWxsLCBcInN1YnRyYWN0XCIsIG9yIFwicHJldlwiLiBXaGVuIGFnZ3Jlc3NpdmUgaXMgZmFsc2VcbiAgLy8gKHR5cGljYWxseSBzZXQgdG8gdHJ1ZSBmb3IgZm9yY2VkIHNpbmdsZS1saW5lIGluZGVudHMpLCBlbXB0eVxuICAvLyBsaW5lcyBhcmUgbm90IGluZGVudGVkLCBhbmQgcGxhY2VzIHdoZXJlIHRoZSBtb2RlIHJldHVybnMgUGFzc1xuICAvLyBhcmUgbGVmdCBhbG9uZS5cbiAgZnVuY3Rpb24gaW5kZW50TGluZShjbSwgbiwgaG93LCBhZ2dyZXNzaXZlKSB7XG4gICAgdmFyIGRvYyA9IGNtLmRvYywgc3RhdGU7XG4gICAgaWYgKGhvdyA9PSBudWxsKSBob3cgPSBcImFkZFwiO1xuICAgIGlmIChob3cgPT0gXCJzbWFydFwiKSB7XG4gICAgICAvLyBGYWxsIGJhY2sgdG8gXCJwcmV2XCIgd2hlbiB0aGUgbW9kZSBkb2Vzbid0IGhhdmUgYW4gaW5kZW50YXRpb25cbiAgICAgIC8vIG1ldGhvZC5cbiAgICAgIGlmICghZG9jLm1vZGUuaW5kZW50KSBob3cgPSBcInByZXZcIjtcbiAgICAgIGVsc2Ugc3RhdGUgPSBnZXRTdGF0ZUJlZm9yZShjbSwgbik7XG4gICAgfVxuXG4gICAgdmFyIHRhYlNpemUgPSBjbS5vcHRpb25zLnRhYlNpemU7XG4gICAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgbiksIGN1clNwYWNlID0gY291bnRDb2x1bW4obGluZS50ZXh0LCBudWxsLCB0YWJTaXplKTtcbiAgICBpZiAobGluZS5zdGF0ZUFmdGVyKSBsaW5lLnN0YXRlQWZ0ZXIgPSBudWxsO1xuICAgIHZhciBjdXJTcGFjZVN0cmluZyA9IGxpbmUudGV4dC5tYXRjaCgvXlxccyovKVswXSwgaW5kZW50YXRpb247XG4gICAgaWYgKCFhZ2dyZXNzaXZlICYmICEvXFxTLy50ZXN0KGxpbmUudGV4dCkpIHtcbiAgICAgIGluZGVudGF0aW9uID0gMDtcbiAgICAgIGhvdyA9IFwibm90XCI7XG4gICAgfSBlbHNlIGlmIChob3cgPT0gXCJzbWFydFwiKSB7XG4gICAgICBpbmRlbnRhdGlvbiA9IGRvYy5tb2RlLmluZGVudChzdGF0ZSwgbGluZS50ZXh0LnNsaWNlKGN1clNwYWNlU3RyaW5nLmxlbmd0aCksIGxpbmUudGV4dCk7XG4gICAgICBpZiAoaW5kZW50YXRpb24gPT0gUGFzcyB8fCBpbmRlbnRhdGlvbiA+IDE1MCkge1xuICAgICAgICBpZiAoIWFnZ3Jlc3NpdmUpIHJldHVybjtcbiAgICAgICAgaG93ID0gXCJwcmV2XCI7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChob3cgPT0gXCJwcmV2XCIpIHtcbiAgICAgIGlmIChuID4gZG9jLmZpcnN0KSBpbmRlbnRhdGlvbiA9IGNvdW50Q29sdW1uKGdldExpbmUoZG9jLCBuLTEpLnRleHQsIG51bGwsIHRhYlNpemUpO1xuICAgICAgZWxzZSBpbmRlbnRhdGlvbiA9IDA7XG4gICAgfSBlbHNlIGlmIChob3cgPT0gXCJhZGRcIikge1xuICAgICAgaW5kZW50YXRpb24gPSBjdXJTcGFjZSArIGNtLm9wdGlvbnMuaW5kZW50VW5pdDtcbiAgICB9IGVsc2UgaWYgKGhvdyA9PSBcInN1YnRyYWN0XCIpIHtcbiAgICAgIGluZGVudGF0aW9uID0gY3VyU3BhY2UgLSBjbS5vcHRpb25zLmluZGVudFVuaXQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgaG93ID09IFwibnVtYmVyXCIpIHtcbiAgICAgIGluZGVudGF0aW9uID0gY3VyU3BhY2UgKyBob3c7XG4gICAgfVxuICAgIGluZGVudGF0aW9uID0gTWF0aC5tYXgoMCwgaW5kZW50YXRpb24pO1xuXG4gICAgdmFyIGluZGVudFN0cmluZyA9IFwiXCIsIHBvcyA9IDA7XG4gICAgaWYgKGNtLm9wdGlvbnMuaW5kZW50V2l0aFRhYnMpXG4gICAgICBmb3IgKHZhciBpID0gTWF0aC5mbG9vcihpbmRlbnRhdGlvbiAvIHRhYlNpemUpOyBpOyAtLWkpIHtwb3MgKz0gdGFiU2l6ZTsgaW5kZW50U3RyaW5nICs9IFwiXFx0XCI7fVxuICAgIGlmIChwb3MgPCBpbmRlbnRhdGlvbikgaW5kZW50U3RyaW5nICs9IHNwYWNlU3RyKGluZGVudGF0aW9uIC0gcG9zKTtcblxuICAgIGlmIChpbmRlbnRTdHJpbmcgIT0gY3VyU3BhY2VTdHJpbmcpIHtcbiAgICAgIHJlcGxhY2VSYW5nZShkb2MsIGluZGVudFN0cmluZywgUG9zKG4sIDApLCBQb3MobiwgY3VyU3BhY2VTdHJpbmcubGVuZ3RoKSwgXCIraW5wdXRcIik7XG4gICAgICBsaW5lLnN0YXRlQWZ0ZXIgPSBudWxsO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEVuc3VyZSB0aGF0LCBpZiB0aGUgY3Vyc29yIHdhcyBpbiB0aGUgd2hpdGVzcGFjZSBhdCB0aGUgc3RhcnRcbiAgICAgIC8vIG9mIHRoZSBsaW5lLCBpdCBpcyBtb3ZlZCB0byB0aGUgZW5kIG9mIHRoYXQgc3BhY2UuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRvYy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByYW5nZSA9IGRvYy5zZWwucmFuZ2VzW2ldO1xuICAgICAgICBpZiAocmFuZ2UuaGVhZC5saW5lID09IG4gJiYgcmFuZ2UuaGVhZC5jaCA8IGN1clNwYWNlU3RyaW5nLmxlbmd0aCkge1xuICAgICAgICAgIHZhciBwb3MgPSBQb3MobiwgY3VyU3BhY2VTdHJpbmcubGVuZ3RoKTtcbiAgICAgICAgICByZXBsYWNlT25lU2VsZWN0aW9uKGRvYywgaSwgbmV3IFJhbmdlKHBvcywgcG9zKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBVdGlsaXR5IGZvciBhcHBseWluZyBhIGNoYW5nZSB0byBhIGxpbmUgYnkgaGFuZGxlIG9yIG51bWJlcixcbiAgLy8gcmV0dXJuaW5nIHRoZSBudW1iZXIgYW5kIG9wdGlvbmFsbHkgcmVnaXN0ZXJpbmcgdGhlIGxpbmUgYXNcbiAgLy8gY2hhbmdlZC5cbiAgZnVuY3Rpb24gY2hhbmdlTGluZShkb2MsIGhhbmRsZSwgY2hhbmdlVHlwZSwgb3ApIHtcbiAgICB2YXIgbm8gPSBoYW5kbGUsIGxpbmUgPSBoYW5kbGU7XG4gICAgaWYgKHR5cGVvZiBoYW5kbGUgPT0gXCJudW1iZXJcIikgbGluZSA9IGdldExpbmUoZG9jLCBjbGlwTGluZShkb2MsIGhhbmRsZSkpO1xuICAgIGVsc2Ugbm8gPSBsaW5lTm8oaGFuZGxlKTtcbiAgICBpZiAobm8gPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKG9wKGxpbmUsIG5vKSAmJiBkb2MuY20pIHJlZ0xpbmVDaGFuZ2UoZG9jLmNtLCBubywgY2hhbmdlVHlwZSk7XG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICAvLyBIZWxwZXIgZm9yIGRlbGV0aW5nIHRleHQgbmVhciB0aGUgc2VsZWN0aW9uKHMpLCB1c2VkIHRvIGltcGxlbWVudFxuICAvLyBiYWNrc3BhY2UsIGRlbGV0ZSwgYW5kIHNpbWlsYXIgZnVuY3Rpb25hbGl0eS5cbiAgZnVuY3Rpb24gZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgY29tcHV0ZSkge1xuICAgIHZhciByYW5nZXMgPSBjbS5kb2Muc2VsLnJhbmdlcywga2lsbCA9IFtdO1xuICAgIC8vIEJ1aWxkIHVwIGEgc2V0IG9mIHJhbmdlcyB0byBraWxsIGZpcnN0LCBtZXJnaW5nIG92ZXJsYXBwaW5nXG4gICAgLy8gcmFuZ2VzLlxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgdG9LaWxsID0gY29tcHV0ZShyYW5nZXNbaV0pO1xuICAgICAgd2hpbGUgKGtpbGwubGVuZ3RoICYmIGNtcCh0b0tpbGwuZnJvbSwgbHN0KGtpbGwpLnRvKSA8PSAwKSB7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IGtpbGwucG9wKCk7XG4gICAgICAgIGlmIChjbXAocmVwbGFjZWQuZnJvbSwgdG9LaWxsLmZyb20pIDwgMCkge1xuICAgICAgICAgIHRvS2lsbC5mcm9tID0gcmVwbGFjZWQuZnJvbTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAga2lsbC5wdXNoKHRvS2lsbCk7XG4gICAgfVxuICAgIC8vIE5leHQsIHJlbW92ZSB0aG9zZSBhY3R1YWwgcmFuZ2VzLlxuICAgIHJ1bkluT3AoY20sIGZ1bmN0aW9uKCkge1xuICAgICAgZm9yICh2YXIgaSA9IGtpbGwubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pXG4gICAgICAgIHJlcGxhY2VSYW5nZShjbS5kb2MsIFwiXCIsIGtpbGxbaV0uZnJvbSwga2lsbFtpXS50bywgXCIrZGVsZXRlXCIpO1xuICAgICAgZW5zdXJlQ3Vyc29yVmlzaWJsZShjbSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VkIGZvciBob3Jpem9udGFsIHJlbGF0aXZlIG1vdGlvbi4gRGlyIGlzIC0xIG9yIDEgKGxlZnQgb3JcbiAgLy8gcmlnaHQpLCB1bml0IGNhbiBiZSBcImNoYXJcIiwgXCJjb2x1bW5cIiAobGlrZSBjaGFyLCBidXQgZG9lc24ndFxuICAvLyBjcm9zcyBsaW5lIGJvdW5kYXJpZXMpLCBcIndvcmRcIiAoYWNyb3NzIG5leHQgd29yZCksIG9yIFwiZ3JvdXBcIiAodG9cbiAgLy8gdGhlIHN0YXJ0IG9mIG5leHQgZ3JvdXAgb2Ygd29yZCBvciBub24td29yZC1ub24td2hpdGVzcGFjZVxuICAvLyBjaGFycykuIFRoZSB2aXN1YWxseSBwYXJhbSBjb250cm9scyB3aGV0aGVyLCBpbiByaWdodC10by1sZWZ0XG4gIC8vIHRleHQsIGRpcmVjdGlvbiAxIG1lYW5zIHRvIG1vdmUgdG93YXJkcyB0aGUgbmV4dCBpbmRleCBpbiB0aGVcbiAgLy8gc3RyaW5nLCBvciB0b3dhcmRzIHRoZSBjaGFyYWN0ZXIgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50XG4gIC8vIHBvc2l0aW9uLiBUaGUgcmVzdWx0aW5nIHBvc2l0aW9uIHdpbGwgaGF2ZSBhIGhpdFNpZGU9dHJ1ZVxuICAvLyBwcm9wZXJ0eSBpZiBpdCByZWFjaGVkIHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50LlxuICBmdW5jdGlvbiBmaW5kUG9zSChkb2MsIHBvcywgZGlyLCB1bml0LCB2aXN1YWxseSkge1xuICAgIHZhciBsaW5lID0gcG9zLmxpbmUsIGNoID0gcG9zLmNoLCBvcmlnRGlyID0gZGlyO1xuICAgIHZhciBsaW5lT2JqID0gZ2V0TGluZShkb2MsIGxpbmUpO1xuICAgIHZhciBwb3NzaWJsZSA9IHRydWU7XG4gICAgZnVuY3Rpb24gZmluZE5leHRMaW5lKCkge1xuICAgICAgdmFyIGwgPSBsaW5lICsgZGlyO1xuICAgICAgaWYgKGwgPCBkb2MuZmlyc3QgfHwgbCA+PSBkb2MuZmlyc3QgKyBkb2Muc2l6ZSkgcmV0dXJuIChwb3NzaWJsZSA9IGZhbHNlKTtcbiAgICAgIGxpbmUgPSBsO1xuICAgICAgcmV0dXJuIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgbCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIG1vdmVPbmNlKGJvdW5kVG9MaW5lKSB7XG4gICAgICB2YXIgbmV4dCA9ICh2aXN1YWxseSA/IG1vdmVWaXN1YWxseSA6IG1vdmVMb2dpY2FsbHkpKGxpbmVPYmosIGNoLCBkaXIsIHRydWUpO1xuICAgICAgaWYgKG5leHQgPT0gbnVsbCkge1xuICAgICAgICBpZiAoIWJvdW5kVG9MaW5lICYmIGZpbmROZXh0TGluZSgpKSB7XG4gICAgICAgICAgaWYgKHZpc3VhbGx5KSBjaCA9IChkaXIgPCAwID8gbGluZVJpZ2h0IDogbGluZUxlZnQpKGxpbmVPYmopO1xuICAgICAgICAgIGVsc2UgY2ggPSBkaXIgPCAwID8gbGluZU9iai50ZXh0Lmxlbmd0aCA6IDA7XG4gICAgICAgIH0gZWxzZSByZXR1cm4gKHBvc3NpYmxlID0gZmFsc2UpO1xuICAgICAgfSBlbHNlIGNoID0gbmV4dDtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh1bml0ID09IFwiY2hhclwiKSBtb3ZlT25jZSgpO1xuICAgIGVsc2UgaWYgKHVuaXQgPT0gXCJjb2x1bW5cIikgbW92ZU9uY2UodHJ1ZSk7XG4gICAgZWxzZSBpZiAodW5pdCA9PSBcIndvcmRcIiB8fCB1bml0ID09IFwiZ3JvdXBcIikge1xuICAgICAgdmFyIHNhd1R5cGUgPSBudWxsLCBncm91cCA9IHVuaXQgPT0gXCJncm91cFwiO1xuICAgICAgdmFyIGhlbHBlciA9IGRvYy5jbSAmJiBkb2MuY20uZ2V0SGVscGVyKHBvcywgXCJ3b3JkQ2hhcnNcIik7XG4gICAgICBmb3IgKHZhciBmaXJzdCA9IHRydWU7OyBmaXJzdCA9IGZhbHNlKSB7XG4gICAgICAgIGlmIChkaXIgPCAwICYmICFtb3ZlT25jZSghZmlyc3QpKSBicmVhaztcbiAgICAgICAgdmFyIGN1ciA9IGxpbmVPYmoudGV4dC5jaGFyQXQoY2gpIHx8IFwiXFxuXCI7XG4gICAgICAgIHZhciB0eXBlID0gaXNXb3JkQ2hhcihjdXIsIGhlbHBlcikgPyBcIndcIlxuICAgICAgICAgIDogZ3JvdXAgJiYgY3VyID09IFwiXFxuXCIgPyBcIm5cIlxuICAgICAgICAgIDogIWdyb3VwIHx8IC9cXHMvLnRlc3QoY3VyKSA/IG51bGxcbiAgICAgICAgICA6IFwicFwiO1xuICAgICAgICBpZiAoZ3JvdXAgJiYgIWZpcnN0ICYmICF0eXBlKSB0eXBlID0gXCJzXCI7XG4gICAgICAgIGlmIChzYXdUeXBlICYmIHNhd1R5cGUgIT0gdHlwZSkge1xuICAgICAgICAgIGlmIChkaXIgPCAwKSB7ZGlyID0gMTsgbW92ZU9uY2UoKTt9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSkgc2F3VHlwZSA9IHR5cGU7XG4gICAgICAgIGlmIChkaXIgPiAwICYmICFtb3ZlT25jZSghZmlyc3QpKSBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIHJlc3VsdCA9IHNraXBBdG9taWMoZG9jLCBQb3MobGluZSwgY2gpLCBvcmlnRGlyLCB0cnVlKTtcbiAgICBpZiAoIXBvc3NpYmxlKSByZXN1bHQuaGl0U2lkZSA9IHRydWU7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIEZvciByZWxhdGl2ZSB2ZXJ0aWNhbCBtb3ZlbWVudC4gRGlyIG1heSBiZSAtMSBvciAxLiBVbml0IGNhbiBiZVxuICAvLyBcInBhZ2VcIiBvciBcImxpbmVcIi4gVGhlIHJlc3VsdGluZyBwb3NpdGlvbiB3aWxsIGhhdmUgYSBoaXRTaWRlPXRydWVcbiAgLy8gcHJvcGVydHkgaWYgaXQgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudC5cbiAgZnVuY3Rpb24gZmluZFBvc1YoY20sIHBvcywgZGlyLCB1bml0KSB7XG4gICAgdmFyIGRvYyA9IGNtLmRvYywgeCA9IHBvcy5sZWZ0LCB5O1xuICAgIGlmICh1bml0ID09IFwicGFnZVwiKSB7XG4gICAgICB2YXIgcGFnZVNpemUgPSBNYXRoLm1pbihjbS5kaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0LCB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCk7XG4gICAgICB5ID0gcG9zLnRvcCArIGRpciAqIChwYWdlU2l6ZSAtIChkaXIgPCAwID8gMS41IDogLjUpICogdGV4dEhlaWdodChjbS5kaXNwbGF5KSk7XG4gICAgfSBlbHNlIGlmICh1bml0ID09IFwibGluZVwiKSB7XG4gICAgICB5ID0gZGlyID4gMCA/IHBvcy5ib3R0b20gKyAzIDogcG9zLnRvcCAtIDM7XG4gICAgfVxuICAgIGZvciAoOzspIHtcbiAgICAgIHZhciB0YXJnZXQgPSBjb29yZHNDaGFyKGNtLCB4LCB5KTtcbiAgICAgIGlmICghdGFyZ2V0Lm91dHNpZGUpIGJyZWFrO1xuICAgICAgaWYgKGRpciA8IDAgPyB5IDw9IDAgOiB5ID49IGRvYy5oZWlnaHQpIHsgdGFyZ2V0LmhpdFNpZGUgPSB0cnVlOyBicmVhazsgfVxuICAgICAgeSArPSBkaXIgKiA1O1xuICAgIH1cbiAgICByZXR1cm4gdGFyZ2V0O1xuICB9XG5cbiAgLy8gRURJVE9SIE1FVEhPRFNcblxuICAvLyBUaGUgcHVibGljbHkgdmlzaWJsZSBBUEkuIE5vdGUgdGhhdCBtZXRob2RPcChmKSBtZWFuc1xuICAvLyAnd3JhcCBmIGluIGFuIG9wZXJhdGlvbiwgcGVyZm9ybWVkIG9uIGl0cyBgdGhpc2AgcGFyYW1ldGVyJy5cblxuICAvLyBUaGlzIGlzIG5vdCB0aGUgY29tcGxldGUgc2V0IG9mIGVkaXRvciBtZXRob2RzLiBNb3N0IG9mIHRoZVxuICAvLyBtZXRob2RzIGRlZmluZWQgb24gdGhlIERvYyB0eXBlIGFyZSBhbHNvIGluamVjdGVkIGludG9cbiAgLy8gQ29kZU1pcnJvci5wcm90b3R5cGUsIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBhbmRcbiAgLy8gY29udmVuaWVuY2UuXG5cbiAgQ29kZU1pcnJvci5wcm90b3R5cGUgPSB7XG4gICAgY29uc3RydWN0b3I6IENvZGVNaXJyb3IsXG4gICAgZm9jdXM6IGZ1bmN0aW9uKCl7d2luZG93LmZvY3VzKCk7IHRoaXMuZGlzcGxheS5pbnB1dC5mb2N1cygpO30sXG5cbiAgICBzZXRPcHRpb246IGZ1bmN0aW9uKG9wdGlvbiwgdmFsdWUpIHtcbiAgICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zLCBvbGQgPSBvcHRpb25zW29wdGlvbl07XG4gICAgICBpZiAob3B0aW9uc1tvcHRpb25dID09IHZhbHVlICYmIG9wdGlvbiAhPSBcIm1vZGVcIikgcmV0dXJuO1xuICAgICAgb3B0aW9uc1tvcHRpb25dID0gdmFsdWU7XG4gICAgICBpZiAob3B0aW9uSGFuZGxlcnMuaGFzT3duUHJvcGVydHkob3B0aW9uKSlcbiAgICAgICAgb3BlcmF0aW9uKHRoaXMsIG9wdGlvbkhhbmRsZXJzW29wdGlvbl0pKHRoaXMsIHZhbHVlLCBvbGQpO1xuICAgIH0sXG5cbiAgICBnZXRPcHRpb246IGZ1bmN0aW9uKG9wdGlvbikge3JldHVybiB0aGlzLm9wdGlvbnNbb3B0aW9uXTt9LFxuICAgIGdldERvYzogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuZG9jO30sXG5cbiAgICBhZGRLZXlNYXA6IGZ1bmN0aW9uKG1hcCwgYm90dG9tKSB7XG4gICAgICB0aGlzLnN0YXRlLmtleU1hcHNbYm90dG9tID8gXCJwdXNoXCIgOiBcInVuc2hpZnRcIl0oZ2V0S2V5TWFwKG1hcCkpO1xuICAgIH0sXG4gICAgcmVtb3ZlS2V5TWFwOiBmdW5jdGlvbihtYXApIHtcbiAgICAgIHZhciBtYXBzID0gdGhpcy5zdGF0ZS5rZXlNYXBzO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXBzLmxlbmd0aDsgKytpKVxuICAgICAgICBpZiAobWFwc1tpXSA9PSBtYXAgfHwgbWFwc1tpXS5uYW1lID09IG1hcCkge1xuICAgICAgICAgIG1hcHMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFkZE92ZXJsYXk6IG1ldGhvZE9wKGZ1bmN0aW9uKHNwZWMsIG9wdGlvbnMpIHtcbiAgICAgIHZhciBtb2RlID0gc3BlYy50b2tlbiA/IHNwZWMgOiBDb2RlTWlycm9yLmdldE1vZGUodGhpcy5vcHRpb25zLCBzcGVjKTtcbiAgICAgIGlmIChtb2RlLnN0YXJ0U3RhdGUpIHRocm93IG5ldyBFcnJvcihcIk92ZXJsYXlzIG1heSBub3QgYmUgc3RhdGVmdWwuXCIpO1xuICAgICAgdGhpcy5zdGF0ZS5vdmVybGF5cy5wdXNoKHttb2RlOiBtb2RlLCBtb2RlU3BlYzogc3BlYywgb3BhcXVlOiBvcHRpb25zICYmIG9wdGlvbnMub3BhcXVlfSk7XG4gICAgICB0aGlzLnN0YXRlLm1vZGVHZW4rKztcbiAgICAgIHJlZ0NoYW5nZSh0aGlzKTtcbiAgICB9KSxcbiAgICByZW1vdmVPdmVybGF5OiBtZXRob2RPcChmdW5jdGlvbihzcGVjKSB7XG4gICAgICB2YXIgb3ZlcmxheXMgPSB0aGlzLnN0YXRlLm92ZXJsYXlzO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvdmVybGF5cy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY3VyID0gb3ZlcmxheXNbaV0ubW9kZVNwZWM7XG4gICAgICAgIGlmIChjdXIgPT0gc3BlYyB8fCB0eXBlb2Ygc3BlYyA9PSBcInN0cmluZ1wiICYmIGN1ci5uYW1lID09IHNwZWMpIHtcbiAgICAgICAgICBvdmVybGF5cy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgdGhpcy5zdGF0ZS5tb2RlR2VuKys7XG4gICAgICAgICAgcmVnQ2hhbmdlKHRoaXMpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pLFxuXG4gICAgaW5kZW50TGluZTogbWV0aG9kT3AoZnVuY3Rpb24obiwgZGlyLCBhZ2dyZXNzaXZlKSB7XG4gICAgICBpZiAodHlwZW9mIGRpciAhPSBcInN0cmluZ1wiICYmIHR5cGVvZiBkaXIgIT0gXCJudW1iZXJcIikge1xuICAgICAgICBpZiAoZGlyID09IG51bGwpIGRpciA9IHRoaXMub3B0aW9ucy5zbWFydEluZGVudCA/IFwic21hcnRcIiA6IFwicHJldlwiO1xuICAgICAgICBlbHNlIGRpciA9IGRpciA/IFwiYWRkXCIgOiBcInN1YnRyYWN0XCI7XG4gICAgICB9XG4gICAgICBpZiAoaXNMaW5lKHRoaXMuZG9jLCBuKSkgaW5kZW50TGluZSh0aGlzLCBuLCBkaXIsIGFnZ3Jlc3NpdmUpO1xuICAgIH0pLFxuICAgIGluZGVudFNlbGVjdGlvbjogbWV0aG9kT3AoZnVuY3Rpb24oaG93KSB7XG4gICAgICB2YXIgcmFuZ2VzID0gdGhpcy5kb2Muc2VsLnJhbmdlcywgZW5kID0gLTE7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmFuZ2UgPSByYW5nZXNbaV07XG4gICAgICAgIGlmICghcmFuZ2UuZW1wdHkoKSkge1xuICAgICAgICAgIHZhciBmcm9tID0gcmFuZ2UuZnJvbSgpLCB0byA9IHJhbmdlLnRvKCk7XG4gICAgICAgICAgdmFyIHN0YXJ0ID0gTWF0aC5tYXgoZW5kLCBmcm9tLmxpbmUpO1xuICAgICAgICAgIGVuZCA9IE1hdGgubWluKHRoaXMubGFzdExpbmUoKSwgdG8ubGluZSAtICh0by5jaCA/IDAgOiAxKSkgKyAxO1xuICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydDsgaiA8IGVuZDsgKytqKVxuICAgICAgICAgICAgaW5kZW50TGluZSh0aGlzLCBqLCBob3cpO1xuICAgICAgICAgIHZhciBuZXdSYW5nZXMgPSB0aGlzLmRvYy5zZWwucmFuZ2VzO1xuICAgICAgICAgIGlmIChmcm9tLmNoID09IDAgJiYgcmFuZ2VzLmxlbmd0aCA9PSBuZXdSYW5nZXMubGVuZ3RoICYmIG5ld1Jhbmdlc1tpXS5mcm9tKCkuY2ggPiAwKVxuICAgICAgICAgICAgcmVwbGFjZU9uZVNlbGVjdGlvbih0aGlzLmRvYywgaSwgbmV3IFJhbmdlKGZyb20sIG5ld1Jhbmdlc1tpXS50bygpKSwgc2VsX2RvbnRTY3JvbGwpO1xuICAgICAgICB9IGVsc2UgaWYgKHJhbmdlLmhlYWQubGluZSA+IGVuZCkge1xuICAgICAgICAgIGluZGVudExpbmUodGhpcywgcmFuZ2UuaGVhZC5saW5lLCBob3csIHRydWUpO1xuICAgICAgICAgIGVuZCA9IHJhbmdlLmhlYWQubGluZTtcbiAgICAgICAgICBpZiAoaSA9PSB0aGlzLmRvYy5zZWwucHJpbUluZGV4KSBlbnN1cmVDdXJzb3JWaXNpYmxlKHRoaXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSksXG5cbiAgICAvLyBGZXRjaCB0aGUgcGFyc2VyIHRva2VuIGZvciBhIGdpdmVuIGNoYXJhY3Rlci4gVXNlZnVsIGZvciBoYWNrc1xuICAgIC8vIHRoYXQgd2FudCB0byBpbnNwZWN0IHRoZSBtb2RlIHN0YXRlIChzYXksIGZvciBjb21wbGV0aW9uKS5cbiAgICBnZXRUb2tlbkF0OiBmdW5jdGlvbihwb3MsIHByZWNpc2UpIHtcbiAgICAgIHJldHVybiB0YWtlVG9rZW4odGhpcywgcG9zLCBwcmVjaXNlKTtcbiAgICB9LFxuXG4gICAgZ2V0TGluZVRva2VuczogZnVuY3Rpb24obGluZSwgcHJlY2lzZSkge1xuICAgICAgcmV0dXJuIHRha2VUb2tlbih0aGlzLCBQb3MobGluZSksIHByZWNpc2UsIHRydWUpO1xuICAgIH0sXG5cbiAgICBnZXRUb2tlblR5cGVBdDogZnVuY3Rpb24ocG9zKSB7XG4gICAgICBwb3MgPSBjbGlwUG9zKHRoaXMuZG9jLCBwb3MpO1xuICAgICAgdmFyIHN0eWxlcyA9IGdldExpbmVTdHlsZXModGhpcywgZ2V0TGluZSh0aGlzLmRvYywgcG9zLmxpbmUpKTtcbiAgICAgIHZhciBiZWZvcmUgPSAwLCBhZnRlciA9IChzdHlsZXMubGVuZ3RoIC0gMSkgLyAyLCBjaCA9IHBvcy5jaDtcbiAgICAgIHZhciB0eXBlO1xuICAgICAgaWYgKGNoID09IDApIHR5cGUgPSBzdHlsZXNbMl07XG4gICAgICBlbHNlIGZvciAoOzspIHtcbiAgICAgICAgdmFyIG1pZCA9IChiZWZvcmUgKyBhZnRlcikgPj4gMTtcbiAgICAgICAgaWYgKChtaWQgPyBzdHlsZXNbbWlkICogMiAtIDFdIDogMCkgPj0gY2gpIGFmdGVyID0gbWlkO1xuICAgICAgICBlbHNlIGlmIChzdHlsZXNbbWlkICogMiArIDFdIDwgY2gpIGJlZm9yZSA9IG1pZCArIDE7XG4gICAgICAgIGVsc2UgeyB0eXBlID0gc3R5bGVzW21pZCAqIDIgKyAyXTsgYnJlYWs7IH1cbiAgICAgIH1cbiAgICAgIHZhciBjdXQgPSB0eXBlID8gdHlwZS5pbmRleE9mKFwiY20tb3ZlcmxheSBcIikgOiAtMTtcbiAgICAgIHJldHVybiBjdXQgPCAwID8gdHlwZSA6IGN1dCA9PSAwID8gbnVsbCA6IHR5cGUuc2xpY2UoMCwgY3V0IC0gMSk7XG4gICAgfSxcblxuICAgIGdldE1vZGVBdDogZnVuY3Rpb24ocG9zKSB7XG4gICAgICB2YXIgbW9kZSA9IHRoaXMuZG9jLm1vZGU7XG4gICAgICBpZiAoIW1vZGUuaW5uZXJNb2RlKSByZXR1cm4gbW9kZTtcbiAgICAgIHJldHVybiBDb2RlTWlycm9yLmlubmVyTW9kZShtb2RlLCB0aGlzLmdldFRva2VuQXQocG9zKS5zdGF0ZSkubW9kZTtcbiAgICB9LFxuXG4gICAgZ2V0SGVscGVyOiBmdW5jdGlvbihwb3MsIHR5cGUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldEhlbHBlcnMocG9zLCB0eXBlKVswXTtcbiAgICB9LFxuXG4gICAgZ2V0SGVscGVyczogZnVuY3Rpb24ocG9zLCB0eXBlKSB7XG4gICAgICB2YXIgZm91bmQgPSBbXTtcbiAgICAgIGlmICghaGVscGVycy5oYXNPd25Qcm9wZXJ0eSh0eXBlKSkgcmV0dXJuIGZvdW5kO1xuICAgICAgdmFyIGhlbHAgPSBoZWxwZXJzW3R5cGVdLCBtb2RlID0gdGhpcy5nZXRNb2RlQXQocG9zKTtcbiAgICAgIGlmICh0eXBlb2YgbW9kZVt0eXBlXSA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGlmIChoZWxwW21vZGVbdHlwZV1dKSBmb3VuZC5wdXNoKGhlbHBbbW9kZVt0eXBlXV0pO1xuICAgICAgfSBlbHNlIGlmIChtb2RlW3R5cGVdKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbW9kZVt0eXBlXS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIHZhciB2YWwgPSBoZWxwW21vZGVbdHlwZV1baV1dO1xuICAgICAgICAgIGlmICh2YWwpIGZvdW5kLnB1c2godmFsKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChtb2RlLmhlbHBlclR5cGUgJiYgaGVscFttb2RlLmhlbHBlclR5cGVdKSB7XG4gICAgICAgIGZvdW5kLnB1c2goaGVscFttb2RlLmhlbHBlclR5cGVdKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscFttb2RlLm5hbWVdKSB7XG4gICAgICAgIGZvdW5kLnB1c2goaGVscFttb2RlLm5hbWVdKTtcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGVscC5fZ2xvYmFsLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjdXIgPSBoZWxwLl9nbG9iYWxbaV07XG4gICAgICAgIGlmIChjdXIucHJlZChtb2RlLCB0aGlzKSAmJiBpbmRleE9mKGZvdW5kLCBjdXIudmFsKSA9PSAtMSlcbiAgICAgICAgICBmb3VuZC5wdXNoKGN1ci52YWwpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kO1xuICAgIH0sXG5cbiAgICBnZXRTdGF0ZUFmdGVyOiBmdW5jdGlvbihsaW5lLCBwcmVjaXNlKSB7XG4gICAgICB2YXIgZG9jID0gdGhpcy5kb2M7XG4gICAgICBsaW5lID0gY2xpcExpbmUoZG9jLCBsaW5lID09IG51bGwgPyBkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDE6IGxpbmUpO1xuICAgICAgcmV0dXJuIGdldFN0YXRlQmVmb3JlKHRoaXMsIGxpbmUgKyAxLCBwcmVjaXNlKTtcbiAgICB9LFxuXG4gICAgY3Vyc29yQ29vcmRzOiBmdW5jdGlvbihzdGFydCwgbW9kZSkge1xuICAgICAgdmFyIHBvcywgcmFuZ2UgPSB0aGlzLmRvYy5zZWwucHJpbWFyeSgpO1xuICAgICAgaWYgKHN0YXJ0ID09IG51bGwpIHBvcyA9IHJhbmdlLmhlYWQ7XG4gICAgICBlbHNlIGlmICh0eXBlb2Ygc3RhcnQgPT0gXCJvYmplY3RcIikgcG9zID0gY2xpcFBvcyh0aGlzLmRvYywgc3RhcnQpO1xuICAgICAgZWxzZSBwb3MgPSBzdGFydCA/IHJhbmdlLmZyb20oKSA6IHJhbmdlLnRvKCk7XG4gICAgICByZXR1cm4gY3Vyc29yQ29vcmRzKHRoaXMsIHBvcywgbW9kZSB8fCBcInBhZ2VcIik7XG4gICAgfSxcblxuICAgIGNoYXJDb29yZHM6IGZ1bmN0aW9uKHBvcywgbW9kZSkge1xuICAgICAgcmV0dXJuIGNoYXJDb29yZHModGhpcywgY2xpcFBvcyh0aGlzLmRvYywgcG9zKSwgbW9kZSB8fCBcInBhZ2VcIik7XG4gICAgfSxcblxuICAgIGNvb3Jkc0NoYXI6IGZ1bmN0aW9uKGNvb3JkcywgbW9kZSkge1xuICAgICAgY29vcmRzID0gZnJvbUNvb3JkU3lzdGVtKHRoaXMsIGNvb3JkcywgbW9kZSB8fCBcInBhZ2VcIik7XG4gICAgICByZXR1cm4gY29vcmRzQ2hhcih0aGlzLCBjb29yZHMubGVmdCwgY29vcmRzLnRvcCk7XG4gICAgfSxcblxuICAgIGxpbmVBdEhlaWdodDogZnVuY3Rpb24oaGVpZ2h0LCBtb2RlKSB7XG4gICAgICBoZWlnaHQgPSBmcm9tQ29vcmRTeXN0ZW0odGhpcywge3RvcDogaGVpZ2h0LCBsZWZ0OiAwfSwgbW9kZSB8fCBcInBhZ2VcIikudG9wO1xuICAgICAgcmV0dXJuIGxpbmVBdEhlaWdodCh0aGlzLmRvYywgaGVpZ2h0ICsgdGhpcy5kaXNwbGF5LnZpZXdPZmZzZXQpO1xuICAgIH0sXG4gICAgaGVpZ2h0QXRMaW5lOiBmdW5jdGlvbihsaW5lLCBtb2RlKSB7XG4gICAgICB2YXIgZW5kID0gZmFsc2UsIGxpbmVPYmo7XG4gICAgICBpZiAodHlwZW9mIGxpbmUgPT0gXCJudW1iZXJcIikge1xuICAgICAgICB2YXIgbGFzdCA9IHRoaXMuZG9jLmZpcnN0ICsgdGhpcy5kb2Muc2l6ZSAtIDE7XG4gICAgICAgIGlmIChsaW5lIDwgdGhpcy5kb2MuZmlyc3QpIGxpbmUgPSB0aGlzLmRvYy5maXJzdDtcbiAgICAgICAgZWxzZSBpZiAobGluZSA+IGxhc3QpIHsgbGluZSA9IGxhc3Q7IGVuZCA9IHRydWU7IH1cbiAgICAgICAgbGluZU9iaiA9IGdldExpbmUodGhpcy5kb2MsIGxpbmUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGluZU9iaiA9IGxpbmU7XG4gICAgICB9XG4gICAgICByZXR1cm4gaW50b0Nvb3JkU3lzdGVtKHRoaXMsIGxpbmVPYmosIHt0b3A6IDAsIGxlZnQ6IDB9LCBtb2RlIHx8IFwicGFnZVwiKS50b3AgK1xuICAgICAgICAoZW5kID8gdGhpcy5kb2MuaGVpZ2h0IC0gaGVpZ2h0QXRMaW5lKGxpbmVPYmopIDogMCk7XG4gICAgfSxcblxuICAgIGRlZmF1bHRUZXh0SGVpZ2h0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRleHRIZWlnaHQodGhpcy5kaXNwbGF5KTsgfSxcbiAgICBkZWZhdWx0Q2hhcldpZHRoOiBmdW5jdGlvbigpIHsgcmV0dXJuIGNoYXJXaWR0aCh0aGlzLmRpc3BsYXkpOyB9LFxuXG4gICAgc2V0R3V0dGVyTWFya2VyOiBtZXRob2RPcChmdW5jdGlvbihsaW5lLCBndXR0ZXJJRCwgdmFsdWUpIHtcbiAgICAgIHJldHVybiBjaGFuZ2VMaW5lKHRoaXMuZG9jLCBsaW5lLCBcImd1dHRlclwiLCBmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgIHZhciBtYXJrZXJzID0gbGluZS5ndXR0ZXJNYXJrZXJzIHx8IChsaW5lLmd1dHRlck1hcmtlcnMgPSB7fSk7XG4gICAgICAgIG1hcmtlcnNbZ3V0dGVySURdID0gdmFsdWU7XG4gICAgICAgIGlmICghdmFsdWUgJiYgaXNFbXB0eShtYXJrZXJzKSkgbGluZS5ndXR0ZXJNYXJrZXJzID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9KTtcbiAgICB9KSxcblxuICAgIGNsZWFyR3V0dGVyOiBtZXRob2RPcChmdW5jdGlvbihndXR0ZXJJRCkge1xuICAgICAgdmFyIGNtID0gdGhpcywgZG9jID0gY20uZG9jLCBpID0gZG9jLmZpcnN0O1xuICAgICAgZG9jLml0ZXIoZnVuY3Rpb24obGluZSkge1xuICAgICAgICBpZiAobGluZS5ndXR0ZXJNYXJrZXJzICYmIGxpbmUuZ3V0dGVyTWFya2Vyc1tndXR0ZXJJRF0pIHtcbiAgICAgICAgICBsaW5lLmd1dHRlck1hcmtlcnNbZ3V0dGVySURdID0gbnVsbDtcbiAgICAgICAgICByZWdMaW5lQ2hhbmdlKGNtLCBpLCBcImd1dHRlclwiKTtcbiAgICAgICAgICBpZiAoaXNFbXB0eShsaW5lLmd1dHRlck1hcmtlcnMpKSBsaW5lLmd1dHRlck1hcmtlcnMgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgICsraTtcbiAgICAgIH0pO1xuICAgIH0pLFxuXG4gICAgbGluZUluZm86IGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIGlmICh0eXBlb2YgbGluZSA9PSBcIm51bWJlclwiKSB7XG4gICAgICAgIGlmICghaXNMaW5lKHRoaXMuZG9jLCBsaW5lKSkgcmV0dXJuIG51bGw7XG4gICAgICAgIHZhciBuID0gbGluZTtcbiAgICAgICAgbGluZSA9IGdldExpbmUodGhpcy5kb2MsIGxpbmUpO1xuICAgICAgICBpZiAoIWxpbmUpIHJldHVybiBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG4gPSBsaW5lTm8obGluZSk7XG4gICAgICAgIGlmIChuID09IG51bGwpIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtsaW5lOiBuLCBoYW5kbGU6IGxpbmUsIHRleHQ6IGxpbmUudGV4dCwgZ3V0dGVyTWFya2VyczogbGluZS5ndXR0ZXJNYXJrZXJzLFxuICAgICAgICAgICAgICB0ZXh0Q2xhc3M6IGxpbmUudGV4dENsYXNzLCBiZ0NsYXNzOiBsaW5lLmJnQ2xhc3MsIHdyYXBDbGFzczogbGluZS53cmFwQ2xhc3MsXG4gICAgICAgICAgICAgIHdpZGdldHM6IGxpbmUud2lkZ2V0c307XG4gICAgfSxcblxuICAgIGdldFZpZXdwb3J0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHtmcm9tOiB0aGlzLmRpc3BsYXkudmlld0Zyb20sIHRvOiB0aGlzLmRpc3BsYXkudmlld1RvfTt9LFxuXG4gICAgYWRkV2lkZ2V0OiBmdW5jdGlvbihwb3MsIG5vZGUsIHNjcm9sbCwgdmVydCwgaG9yaXopIHtcbiAgICAgIHZhciBkaXNwbGF5ID0gdGhpcy5kaXNwbGF5O1xuICAgICAgcG9zID0gY3Vyc29yQ29vcmRzKHRoaXMsIGNsaXBQb3ModGhpcy5kb2MsIHBvcykpO1xuICAgICAgdmFyIHRvcCA9IHBvcy5ib3R0b20sIGxlZnQgPSBwb3MubGVmdDtcbiAgICAgIG5vZGUuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgICBub2RlLnNldEF0dHJpYnV0ZShcImNtLWlnbm9yZS1ldmVudHNcIiwgXCJ0cnVlXCIpO1xuICAgICAgdGhpcy5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUobm9kZSk7XG4gICAgICBkaXNwbGF5LnNpemVyLmFwcGVuZENoaWxkKG5vZGUpO1xuICAgICAgaWYgKHZlcnQgPT0gXCJvdmVyXCIpIHtcbiAgICAgICAgdG9wID0gcG9zLnRvcDtcbiAgICAgIH0gZWxzZSBpZiAodmVydCA9PSBcImFib3ZlXCIgfHwgdmVydCA9PSBcIm5lYXJcIikge1xuICAgICAgICB2YXIgdnNwYWNlID0gTWF0aC5tYXgoZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodCwgdGhpcy5kb2MuaGVpZ2h0KSxcbiAgICAgICAgaHNwYWNlID0gTWF0aC5tYXgoZGlzcGxheS5zaXplci5jbGllbnRXaWR0aCwgZGlzcGxheS5saW5lU3BhY2UuY2xpZW50V2lkdGgpO1xuICAgICAgICAvLyBEZWZhdWx0IHRvIHBvc2l0aW9uaW5nIGFib3ZlIChpZiBzcGVjaWZpZWQgYW5kIHBvc3NpYmxlKTsgb3RoZXJ3aXNlIGRlZmF1bHQgdG8gcG9zaXRpb25pbmcgYmVsb3dcbiAgICAgICAgaWYgKCh2ZXJ0ID09ICdhYm92ZScgfHwgcG9zLmJvdHRvbSArIG5vZGUub2Zmc2V0SGVpZ2h0ID4gdnNwYWNlKSAmJiBwb3MudG9wID4gbm9kZS5vZmZzZXRIZWlnaHQpXG4gICAgICAgICAgdG9wID0gcG9zLnRvcCAtIG5vZGUub2Zmc2V0SGVpZ2h0O1xuICAgICAgICBlbHNlIGlmIChwb3MuYm90dG9tICsgbm9kZS5vZmZzZXRIZWlnaHQgPD0gdnNwYWNlKVxuICAgICAgICAgIHRvcCA9IHBvcy5ib3R0b207XG4gICAgICAgIGlmIChsZWZ0ICsgbm9kZS5vZmZzZXRXaWR0aCA+IGhzcGFjZSlcbiAgICAgICAgICBsZWZ0ID0gaHNwYWNlIC0gbm9kZS5vZmZzZXRXaWR0aDtcbiAgICAgIH1cbiAgICAgIG5vZGUuc3R5bGUudG9wID0gdG9wICsgXCJweFwiO1xuICAgICAgbm9kZS5zdHlsZS5sZWZ0ID0gbm9kZS5zdHlsZS5yaWdodCA9IFwiXCI7XG4gICAgICBpZiAoaG9yaXogPT0gXCJyaWdodFwiKSB7XG4gICAgICAgIGxlZnQgPSBkaXNwbGF5LnNpemVyLmNsaWVudFdpZHRoIC0gbm9kZS5vZmZzZXRXaWR0aDtcbiAgICAgICAgbm9kZS5zdHlsZS5yaWdodCA9IFwiMHB4XCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoaG9yaXogPT0gXCJsZWZ0XCIpIGxlZnQgPSAwO1xuICAgICAgICBlbHNlIGlmIChob3JpeiA9PSBcIm1pZGRsZVwiKSBsZWZ0ID0gKGRpc3BsYXkuc2l6ZXIuY2xpZW50V2lkdGggLSBub2RlLm9mZnNldFdpZHRoKSAvIDI7XG4gICAgICAgIG5vZGUuc3R5bGUubGVmdCA9IGxlZnQgKyBcInB4XCI7XG4gICAgICB9XG4gICAgICBpZiAoc2Nyb2xsKVxuICAgICAgICBzY3JvbGxJbnRvVmlldyh0aGlzLCBsZWZ0LCB0b3AsIGxlZnQgKyBub2RlLm9mZnNldFdpZHRoLCB0b3AgKyBub2RlLm9mZnNldEhlaWdodCk7XG4gICAgfSxcblxuICAgIHRyaWdnZXJPbktleURvd246IG1ldGhvZE9wKG9uS2V5RG93biksXG4gICAgdHJpZ2dlck9uS2V5UHJlc3M6IG1ldGhvZE9wKG9uS2V5UHJlc3MpLFxuICAgIHRyaWdnZXJPbktleVVwOiBvbktleVVwLFxuXG4gICAgZXhlY0NvbW1hbmQ6IGZ1bmN0aW9uKGNtZCkge1xuICAgICAgaWYgKGNvbW1hbmRzLmhhc093blByb3BlcnR5KGNtZCkpXG4gICAgICAgIHJldHVybiBjb21tYW5kc1tjbWRdLmNhbGwobnVsbCwgdGhpcyk7XG4gICAgfSxcblxuICAgIHRyaWdnZXJFbGVjdHJpYzogbWV0aG9kT3AoZnVuY3Rpb24odGV4dCkgeyB0cmlnZ2VyRWxlY3RyaWModGhpcywgdGV4dCk7IH0pLFxuXG4gICAgZmluZFBvc0g6IGZ1bmN0aW9uKGZyb20sIGFtb3VudCwgdW5pdCwgdmlzdWFsbHkpIHtcbiAgICAgIHZhciBkaXIgPSAxO1xuICAgICAgaWYgKGFtb3VudCA8IDApIHsgZGlyID0gLTE7IGFtb3VudCA9IC1hbW91bnQ7IH1cbiAgICAgIGZvciAodmFyIGkgPSAwLCBjdXIgPSBjbGlwUG9zKHRoaXMuZG9jLCBmcm9tKTsgaSA8IGFtb3VudDsgKytpKSB7XG4gICAgICAgIGN1ciA9IGZpbmRQb3NIKHRoaXMuZG9jLCBjdXIsIGRpciwgdW5pdCwgdmlzdWFsbHkpO1xuICAgICAgICBpZiAoY3VyLmhpdFNpZGUpIGJyZWFrO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGN1cjtcbiAgICB9LFxuXG4gICAgbW92ZUg6IG1ldGhvZE9wKGZ1bmN0aW9uKGRpciwgdW5pdCkge1xuICAgICAgdmFyIGNtID0gdGhpcztcbiAgICAgIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICBpZiAoY20uZGlzcGxheS5zaGlmdCB8fCBjbS5kb2MuZXh0ZW5kIHx8IHJhbmdlLmVtcHR5KCkpXG4gICAgICAgICAgcmV0dXJuIGZpbmRQb3NIKGNtLmRvYywgcmFuZ2UuaGVhZCwgZGlyLCB1bml0LCBjbS5vcHRpb25zLnJ0bE1vdmVWaXN1YWxseSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByZXR1cm4gZGlyIDwgMCA/IHJhbmdlLmZyb20oKSA6IHJhbmdlLnRvKCk7XG4gICAgICB9LCBzZWxfbW92ZSk7XG4gICAgfSksXG5cbiAgICBkZWxldGVIOiBtZXRob2RPcChmdW5jdGlvbihkaXIsIHVuaXQpIHtcbiAgICAgIHZhciBzZWwgPSB0aGlzLmRvYy5zZWwsIGRvYyA9IHRoaXMuZG9jO1xuICAgICAgaWYgKHNlbC5zb21ldGhpbmdTZWxlY3RlZCgpKVxuICAgICAgICBkb2MucmVwbGFjZVNlbGVjdGlvbihcIlwiLCBudWxsLCBcIitkZWxldGVcIik7XG4gICAgICBlbHNlXG4gICAgICAgIGRlbGV0ZU5lYXJTZWxlY3Rpb24odGhpcywgZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSBmaW5kUG9zSChkb2MsIHJhbmdlLmhlYWQsIGRpciwgdW5pdCwgZmFsc2UpO1xuICAgICAgICAgIHJldHVybiBkaXIgPCAwID8ge2Zyb206IG90aGVyLCB0bzogcmFuZ2UuaGVhZH0gOiB7ZnJvbTogcmFuZ2UuaGVhZCwgdG86IG90aGVyfTtcbiAgICAgICAgfSk7XG4gICAgfSksXG5cbiAgICBmaW5kUG9zVjogZnVuY3Rpb24oZnJvbSwgYW1vdW50LCB1bml0LCBnb2FsQ29sdW1uKSB7XG4gICAgICB2YXIgZGlyID0gMSwgeCA9IGdvYWxDb2x1bW47XG4gICAgICBpZiAoYW1vdW50IDwgMCkgeyBkaXIgPSAtMTsgYW1vdW50ID0gLWFtb3VudDsgfVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGN1ciA9IGNsaXBQb3ModGhpcy5kb2MsIGZyb20pOyBpIDwgYW1vdW50OyArK2kpIHtcbiAgICAgICAgdmFyIGNvb3JkcyA9IGN1cnNvckNvb3Jkcyh0aGlzLCBjdXIsIFwiZGl2XCIpO1xuICAgICAgICBpZiAoeCA9PSBudWxsKSB4ID0gY29vcmRzLmxlZnQ7XG4gICAgICAgIGVsc2UgY29vcmRzLmxlZnQgPSB4O1xuICAgICAgICBjdXIgPSBmaW5kUG9zVih0aGlzLCBjb29yZHMsIGRpciwgdW5pdCk7XG4gICAgICAgIGlmIChjdXIuaGl0U2lkZSkgYnJlYWs7XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VyO1xuICAgIH0sXG5cbiAgICBtb3ZlVjogbWV0aG9kT3AoZnVuY3Rpb24oZGlyLCB1bml0KSB7XG4gICAgICB2YXIgY20gPSB0aGlzLCBkb2MgPSB0aGlzLmRvYywgZ29hbHMgPSBbXTtcbiAgICAgIHZhciBjb2xsYXBzZSA9ICFjbS5kaXNwbGF5LnNoaWZ0ICYmICFkb2MuZXh0ZW5kICYmIGRvYy5zZWwuc29tZXRoaW5nU2VsZWN0ZWQoKTtcbiAgICAgIGRvYy5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgaWYgKGNvbGxhcHNlKVxuICAgICAgICAgIHJldHVybiBkaXIgPCAwID8gcmFuZ2UuZnJvbSgpIDogcmFuZ2UudG8oKTtcbiAgICAgICAgdmFyIGhlYWRQb3MgPSBjdXJzb3JDb29yZHMoY20sIHJhbmdlLmhlYWQsIFwiZGl2XCIpO1xuICAgICAgICBpZiAocmFuZ2UuZ29hbENvbHVtbiAhPSBudWxsKSBoZWFkUG9zLmxlZnQgPSByYW5nZS5nb2FsQ29sdW1uO1xuICAgICAgICBnb2Fscy5wdXNoKGhlYWRQb3MubGVmdCk7XG4gICAgICAgIHZhciBwb3MgPSBmaW5kUG9zVihjbSwgaGVhZFBvcywgZGlyLCB1bml0KTtcbiAgICAgICAgaWYgKHVuaXQgPT0gXCJwYWdlXCIgJiYgcmFuZ2UgPT0gZG9jLnNlbC5wcmltYXJ5KCkpXG4gICAgICAgICAgYWRkVG9TY3JvbGxQb3MoY20sIG51bGwsIGNoYXJDb29yZHMoY20sIHBvcywgXCJkaXZcIikudG9wIC0gaGVhZFBvcy50b3ApO1xuICAgICAgICByZXR1cm4gcG9zO1xuICAgICAgfSwgc2VsX21vdmUpO1xuICAgICAgaWYgKGdvYWxzLmxlbmd0aCkgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICAgICAgZG9jLnNlbC5yYW5nZXNbaV0uZ29hbENvbHVtbiA9IGdvYWxzW2ldO1xuICAgIH0pLFxuXG4gICAgLy8gRmluZCB0aGUgd29yZCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gKGFzIHJldHVybmVkIGJ5IGNvb3Jkc0NoYXIpLlxuICAgIGZpbmRXb3JkQXQ6IGZ1bmN0aW9uKHBvcykge1xuICAgICAgdmFyIGRvYyA9IHRoaXMuZG9jLCBsaW5lID0gZ2V0TGluZShkb2MsIHBvcy5saW5lKS50ZXh0O1xuICAgICAgdmFyIHN0YXJ0ID0gcG9zLmNoLCBlbmQgPSBwb3MuY2g7XG4gICAgICBpZiAobGluZSkge1xuICAgICAgICB2YXIgaGVscGVyID0gdGhpcy5nZXRIZWxwZXIocG9zLCBcIndvcmRDaGFyc1wiKTtcbiAgICAgICAgaWYgKChwb3MueFJlbCA8IDAgfHwgZW5kID09IGxpbmUubGVuZ3RoKSAmJiBzdGFydCkgLS1zdGFydDsgZWxzZSArK2VuZDtcbiAgICAgICAgdmFyIHN0YXJ0Q2hhciA9IGxpbmUuY2hhckF0KHN0YXJ0KTtcbiAgICAgICAgdmFyIGNoZWNrID0gaXNXb3JkQ2hhcihzdGFydENoYXIsIGhlbHBlcilcbiAgICAgICAgICA/IGZ1bmN0aW9uKGNoKSB7IHJldHVybiBpc1dvcmRDaGFyKGNoLCBoZWxwZXIpOyB9XG4gICAgICAgICAgOiAvXFxzLy50ZXN0KHN0YXJ0Q2hhcikgPyBmdW5jdGlvbihjaCkge3JldHVybiAvXFxzLy50ZXN0KGNoKTt9XG4gICAgICAgICAgOiBmdW5jdGlvbihjaCkge3JldHVybiAhL1xccy8udGVzdChjaCkgJiYgIWlzV29yZENoYXIoY2gpO307XG4gICAgICAgIHdoaWxlIChzdGFydCA+IDAgJiYgY2hlY2sobGluZS5jaGFyQXQoc3RhcnQgLSAxKSkpIC0tc3RhcnQ7XG4gICAgICAgIHdoaWxlIChlbmQgPCBsaW5lLmxlbmd0aCAmJiBjaGVjayhsaW5lLmNoYXJBdChlbmQpKSkgKytlbmQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV3IFJhbmdlKFBvcyhwb3MubGluZSwgc3RhcnQpLCBQb3MocG9zLmxpbmUsIGVuZCkpO1xuICAgIH0sXG5cbiAgICB0b2dnbGVPdmVyd3JpdGU6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAodmFsdWUgIT0gbnVsbCAmJiB2YWx1ZSA9PSB0aGlzLnN0YXRlLm92ZXJ3cml0ZSkgcmV0dXJuO1xuICAgICAgaWYgKHRoaXMuc3RhdGUub3ZlcndyaXRlID0gIXRoaXMuc3RhdGUub3ZlcndyaXRlKVxuICAgICAgICBhZGRDbGFzcyh0aGlzLmRpc3BsYXkuY3Vyc29yRGl2LCBcIkNvZGVNaXJyb3Itb3ZlcndyaXRlXCIpO1xuICAgICAgZWxzZVxuICAgICAgICBybUNsYXNzKHRoaXMuZGlzcGxheS5jdXJzb3JEaXYsIFwiQ29kZU1pcnJvci1vdmVyd3JpdGVcIik7XG5cbiAgICAgIHNpZ25hbCh0aGlzLCBcIm92ZXJ3cml0ZVRvZ2dsZVwiLCB0aGlzLCB0aGlzLnN0YXRlLm92ZXJ3cml0ZSk7XG4gICAgfSxcbiAgICBoYXNGb2N1czogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRpc3BsYXkuaW5wdXQuZ2V0RmllbGQoKSA9PSBhY3RpdmVFbHQoKTsgfSxcblxuICAgIHNjcm9sbFRvOiBtZXRob2RPcChmdW5jdGlvbih4LCB5KSB7XG4gICAgICBpZiAoeCAhPSBudWxsIHx8IHkgIT0gbnVsbCkgcmVzb2x2ZVNjcm9sbFRvUG9zKHRoaXMpO1xuICAgICAgaWYgKHggIT0gbnVsbCkgdGhpcy5jdXJPcC5zY3JvbGxMZWZ0ID0geDtcbiAgICAgIGlmICh5ICE9IG51bGwpIHRoaXMuY3VyT3Auc2Nyb2xsVG9wID0geTtcbiAgICB9KSxcbiAgICBnZXRTY3JvbGxJbmZvOiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBzY3JvbGxlciA9IHRoaXMuZGlzcGxheS5zY3JvbGxlcjtcbiAgICAgIHJldHVybiB7bGVmdDogc2Nyb2xsZXIuc2Nyb2xsTGVmdCwgdG9wOiBzY3JvbGxlci5zY3JvbGxUb3AsXG4gICAgICAgICAgICAgIGhlaWdodDogc2Nyb2xsZXIuc2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsR2FwKHRoaXMpIC0gdGhpcy5kaXNwbGF5LmJhckhlaWdodCxcbiAgICAgICAgICAgICAgd2lkdGg6IHNjcm9sbGVyLnNjcm9sbFdpZHRoIC0gc2Nyb2xsR2FwKHRoaXMpIC0gdGhpcy5kaXNwbGF5LmJhcldpZHRoLFxuICAgICAgICAgICAgICBjbGllbnRIZWlnaHQ6IGRpc3BsYXlIZWlnaHQodGhpcyksIGNsaWVudFdpZHRoOiBkaXNwbGF5V2lkdGgodGhpcyl9O1xuICAgIH0sXG5cbiAgICBzY3JvbGxJbnRvVmlldzogbWV0aG9kT3AoZnVuY3Rpb24ocmFuZ2UsIG1hcmdpbikge1xuICAgICAgaWYgKHJhbmdlID09IG51bGwpIHtcbiAgICAgICAgcmFuZ2UgPSB7ZnJvbTogdGhpcy5kb2Muc2VsLnByaW1hcnkoKS5oZWFkLCB0bzogbnVsbH07XG4gICAgICAgIGlmIChtYXJnaW4gPT0gbnVsbCkgbWFyZ2luID0gdGhpcy5vcHRpb25zLmN1cnNvclNjcm9sbE1hcmdpbjtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHJhbmdlID09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgcmFuZ2UgPSB7ZnJvbTogUG9zKHJhbmdlLCAwKSwgdG86IG51bGx9O1xuICAgICAgfSBlbHNlIGlmIChyYW5nZS5mcm9tID09IG51bGwpIHtcbiAgICAgICAgcmFuZ2UgPSB7ZnJvbTogcmFuZ2UsIHRvOiBudWxsfTtcbiAgICAgIH1cbiAgICAgIGlmICghcmFuZ2UudG8pIHJhbmdlLnRvID0gcmFuZ2UuZnJvbTtcbiAgICAgIHJhbmdlLm1hcmdpbiA9IG1hcmdpbiB8fCAwO1xuXG4gICAgICBpZiAocmFuZ2UuZnJvbS5saW5lICE9IG51bGwpIHtcbiAgICAgICAgcmVzb2x2ZVNjcm9sbFRvUG9zKHRoaXMpO1xuICAgICAgICB0aGlzLmN1ck9wLnNjcm9sbFRvUG9zID0gcmFuZ2U7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgc1BvcyA9IGNhbGN1bGF0ZVNjcm9sbFBvcyh0aGlzLCBNYXRoLm1pbihyYW5nZS5mcm9tLmxlZnQsIHJhbmdlLnRvLmxlZnQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBNYXRoLm1pbihyYW5nZS5mcm9tLnRvcCwgcmFuZ2UudG8udG9wKSAtIHJhbmdlLm1hcmdpbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5tYXgocmFuZ2UuZnJvbS5yaWdodCwgcmFuZ2UudG8ucmlnaHQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBNYXRoLm1heChyYW5nZS5mcm9tLmJvdHRvbSwgcmFuZ2UudG8uYm90dG9tKSArIHJhbmdlLm1hcmdpbik7XG4gICAgICAgIHRoaXMuc2Nyb2xsVG8oc1Bvcy5zY3JvbGxMZWZ0LCBzUG9zLnNjcm9sbFRvcCk7XG4gICAgICB9XG4gICAgfSksXG5cbiAgICBzZXRTaXplOiBtZXRob2RPcChmdW5jdGlvbih3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICB2YXIgY20gPSB0aGlzO1xuICAgICAgZnVuY3Rpb24gaW50ZXJwcmV0KHZhbCkge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHZhbCA9PSBcIm51bWJlclwiIHx8IC9eXFxkKyQvLnRlc3QoU3RyaW5nKHZhbCkpID8gdmFsICsgXCJweFwiIDogdmFsO1xuICAgICAgfVxuICAgICAgaWYgKHdpZHRoICE9IG51bGwpIGNtLmRpc3BsYXkud3JhcHBlci5zdHlsZS53aWR0aCA9IGludGVycHJldCh3aWR0aCk7XG4gICAgICBpZiAoaGVpZ2h0ICE9IG51bGwpIGNtLmRpc3BsYXkud3JhcHBlci5zdHlsZS5oZWlnaHQgPSBpbnRlcnByZXQoaGVpZ2h0KTtcbiAgICAgIGlmIChjbS5vcHRpb25zLmxpbmVXcmFwcGluZykgY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZSh0aGlzKTtcbiAgICAgIHZhciBsaW5lTm8gPSBjbS5kaXNwbGF5LnZpZXdGcm9tO1xuICAgICAgY20uZG9jLml0ZXIobGluZU5vLCBjbS5kaXNwbGF5LnZpZXdUbywgZnVuY3Rpb24obGluZSkge1xuICAgICAgICBpZiAobGluZS53aWRnZXRzKSBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmUud2lkZ2V0cy5sZW5ndGg7IGkrKylcbiAgICAgICAgICBpZiAobGluZS53aWRnZXRzW2ldLm5vSFNjcm9sbCkgeyByZWdMaW5lQ2hhbmdlKGNtLCBsaW5lTm8sIFwid2lkZ2V0XCIpOyBicmVhazsgfVxuICAgICAgICArK2xpbmVObztcbiAgICAgIH0pO1xuICAgICAgY20uY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgICAgc2lnbmFsKGNtLCBcInJlZnJlc2hcIiwgdGhpcyk7XG4gICAgfSksXG5cbiAgICBvcGVyYXRpb246IGZ1bmN0aW9uKGYpe3JldHVybiBydW5Jbk9wKHRoaXMsIGYpO30sXG5cbiAgICByZWZyZXNoOiBtZXRob2RPcChmdW5jdGlvbigpIHtcbiAgICAgIHZhciBvbGRIZWlnaHQgPSB0aGlzLmRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodDtcbiAgICAgIHJlZ0NoYW5nZSh0aGlzKTtcbiAgICAgIHRoaXMuY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgICAgY2xlYXJDYWNoZXModGhpcyk7XG4gICAgICB0aGlzLnNjcm9sbFRvKHRoaXMuZG9jLnNjcm9sbExlZnQsIHRoaXMuZG9jLnNjcm9sbFRvcCk7XG4gICAgICB1cGRhdGVHdXR0ZXJTcGFjZSh0aGlzKTtcbiAgICAgIGlmIChvbGRIZWlnaHQgPT0gbnVsbCB8fCBNYXRoLmFicyhvbGRIZWlnaHQgLSB0ZXh0SGVpZ2h0KHRoaXMuZGlzcGxheSkpID4gLjUpXG4gICAgICAgIGVzdGltYXRlTGluZUhlaWdodHModGhpcyk7XG4gICAgICBzaWduYWwodGhpcywgXCJyZWZyZXNoXCIsIHRoaXMpO1xuICAgIH0pLFxuXG4gICAgc3dhcERvYzogbWV0aG9kT3AoZnVuY3Rpb24oZG9jKSB7XG4gICAgICB2YXIgb2xkID0gdGhpcy5kb2M7XG4gICAgICBvbGQuY20gPSBudWxsO1xuICAgICAgYXR0YWNoRG9jKHRoaXMsIGRvYyk7XG4gICAgICBjbGVhckNhY2hlcyh0aGlzKTtcbiAgICAgIHRoaXMuZGlzcGxheS5pbnB1dC5yZXNldCgpO1xuICAgICAgdGhpcy5zY3JvbGxUbyhkb2Muc2Nyb2xsTGVmdCwgZG9jLnNjcm9sbFRvcCk7XG4gICAgICB0aGlzLmN1ck9wLmZvcmNlU2Nyb2xsID0gdHJ1ZTtcbiAgICAgIHNpZ25hbExhdGVyKHRoaXMsIFwic3dhcERvY1wiLCB0aGlzLCBvbGQpO1xuICAgICAgcmV0dXJuIG9sZDtcbiAgICB9KSxcblxuICAgIGdldElucHV0RmllbGQ6IGZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGlzcGxheS5pbnB1dC5nZXRGaWVsZCgpO30sXG4gICAgZ2V0V3JhcHBlckVsZW1lbnQ6IGZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGlzcGxheS53cmFwcGVyO30sXG4gICAgZ2V0U2Nyb2xsZXJFbGVtZW50OiBmdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3BsYXkuc2Nyb2xsZXI7fSxcbiAgICBnZXRHdXR0ZXJFbGVtZW50OiBmdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3BsYXkuZ3V0dGVyczt9XG4gIH07XG4gIGV2ZW50TWl4aW4oQ29kZU1pcnJvcik7XG5cbiAgLy8gT1BUSU9OIERFRkFVTFRTXG5cbiAgLy8gVGhlIGRlZmF1bHQgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICB2YXIgZGVmYXVsdHMgPSBDb2RlTWlycm9yLmRlZmF1bHRzID0ge307XG4gIC8vIEZ1bmN0aW9ucyB0byBydW4gd2hlbiBvcHRpb25zIGFyZSBjaGFuZ2VkLlxuICB2YXIgb3B0aW9uSGFuZGxlcnMgPSBDb2RlTWlycm9yLm9wdGlvbkhhbmRsZXJzID0ge307XG5cbiAgZnVuY3Rpb24gb3B0aW9uKG5hbWUsIGRlZmx0LCBoYW5kbGUsIG5vdE9uSW5pdCkge1xuICAgIENvZGVNaXJyb3IuZGVmYXVsdHNbbmFtZV0gPSBkZWZsdDtcbiAgICBpZiAoaGFuZGxlKSBvcHRpb25IYW5kbGVyc1tuYW1lXSA9XG4gICAgICBub3RPbkluaXQgPyBmdW5jdGlvbihjbSwgdmFsLCBvbGQpIHtpZiAob2xkICE9IEluaXQpIGhhbmRsZShjbSwgdmFsLCBvbGQpO30gOiBoYW5kbGU7XG4gIH1cblxuICAvLyBQYXNzZWQgdG8gb3B0aW9uIGhhbmRsZXJzIHdoZW4gdGhlcmUgaXMgbm8gb2xkIHZhbHVlLlxuICB2YXIgSW5pdCA9IENvZGVNaXJyb3IuSW5pdCA9IHt0b1N0cmluZzogZnVuY3Rpb24oKXtyZXR1cm4gXCJDb2RlTWlycm9yLkluaXRcIjt9fTtcblxuICAvLyBUaGVzZSB0d28gYXJlLCBvbiBpbml0LCBjYWxsZWQgZnJvbSB0aGUgY29uc3RydWN0b3IgYmVjYXVzZSB0aGV5XG4gIC8vIGhhdmUgdG8gYmUgaW5pdGlhbGl6ZWQgYmVmb3JlIHRoZSBlZGl0b3IgY2FuIHN0YXJ0IGF0IGFsbC5cbiAgb3B0aW9uKFwidmFsdWVcIiwgXCJcIiwgZnVuY3Rpb24oY20sIHZhbCkge1xuICAgIGNtLnNldFZhbHVlKHZhbCk7XG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJtb2RlXCIsIG51bGwsIGZ1bmN0aW9uKGNtLCB2YWwpIHtcbiAgICBjbS5kb2MubW9kZU9wdGlvbiA9IHZhbDtcbiAgICBsb2FkTW9kZShjbSk7XG4gIH0sIHRydWUpO1xuXG4gIG9wdGlvbihcImluZGVudFVuaXRcIiwgMiwgbG9hZE1vZGUsIHRydWUpO1xuICBvcHRpb24oXCJpbmRlbnRXaXRoVGFic1wiLCBmYWxzZSk7XG4gIG9wdGlvbihcInNtYXJ0SW5kZW50XCIsIHRydWUpO1xuICBvcHRpb24oXCJ0YWJTaXplXCIsIDQsIGZ1bmN0aW9uKGNtKSB7XG4gICAgcmVzZXRNb2RlU3RhdGUoY20pO1xuICAgIGNsZWFyQ2FjaGVzKGNtKTtcbiAgICByZWdDaGFuZ2UoY20pO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwibGluZVNlcGFyYXRvclwiLCBudWxsLCBmdW5jdGlvbihjbSwgdmFsKSB7XG4gICAgY20uZG9jLmxpbmVTZXAgPSB2YWw7XG4gICAgaWYgKCF2YWwpIHJldHVybjtcbiAgICB2YXIgbmV3QnJlYWtzID0gW10sIGxpbmVObyA9IGNtLmRvYy5maXJzdDtcbiAgICBjbS5kb2MuaXRlcihmdW5jdGlvbihsaW5lKSB7XG4gICAgICBmb3IgKHZhciBwb3MgPSAwOzspIHtcbiAgICAgICAgdmFyIGZvdW5kID0gbGluZS50ZXh0LmluZGV4T2YodmFsLCBwb3MpO1xuICAgICAgICBpZiAoZm91bmQgPT0gLTEpIGJyZWFrO1xuICAgICAgICBwb3MgPSBmb3VuZCArIHZhbC5sZW5ndGg7XG4gICAgICAgIG5ld0JyZWFrcy5wdXNoKFBvcyhsaW5lTm8sIGZvdW5kKSk7XG4gICAgICB9XG4gICAgICBsaW5lTm8rKztcbiAgICB9KTtcbiAgICBmb3IgKHZhciBpID0gbmV3QnJlYWtzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKVxuICAgICAgcmVwbGFjZVJhbmdlKGNtLmRvYywgdmFsLCBuZXdCcmVha3NbaV0sIFBvcyhuZXdCcmVha3NbaV0ubGluZSwgbmV3QnJlYWtzW2ldLmNoICsgdmFsLmxlbmd0aCkpXG4gIH0pO1xuICBvcHRpb24oXCJzcGVjaWFsQ2hhcnNcIiwgL1tcXHRcXHUwMDAwLVxcdTAwMTlcXHUwMGFkXFx1MjAwYi1cXHUyMDBmXFx1MjAyOFxcdTIwMjlcXHVmZWZmXS9nLCBmdW5jdGlvbihjbSwgdmFsLCBvbGQpIHtcbiAgICBjbS5zdGF0ZS5zcGVjaWFsQ2hhcnMgPSBuZXcgUmVnRXhwKHZhbC5zb3VyY2UgKyAodmFsLnRlc3QoXCJcXHRcIikgPyBcIlwiIDogXCJ8XFx0XCIpLCBcImdcIik7XG4gICAgaWYgKG9sZCAhPSBDb2RlTWlycm9yLkluaXQpIGNtLnJlZnJlc2goKTtcbiAgfSk7XG4gIG9wdGlvbihcInNwZWNpYWxDaGFyUGxhY2Vob2xkZXJcIiwgZGVmYXVsdFNwZWNpYWxDaGFyUGxhY2Vob2xkZXIsIGZ1bmN0aW9uKGNtKSB7Y20ucmVmcmVzaCgpO30sIHRydWUpO1xuICBvcHRpb24oXCJlbGVjdHJpY0NoYXJzXCIsIHRydWUpO1xuICBvcHRpb24oXCJpbnB1dFN0eWxlXCIsIG1vYmlsZSA/IFwiY29udGVudGVkaXRhYmxlXCIgOiBcInRleHRhcmVhXCIsIGZ1bmN0aW9uKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcImlucHV0U3R5bGUgY2FuIG5vdCAoeWV0KSBiZSBjaGFuZ2VkIGluIGEgcnVubmluZyBlZGl0b3JcIik7IC8vIEZJWE1FXG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJydGxNb3ZlVmlzdWFsbHlcIiwgIXdpbmRvd3MpO1xuICBvcHRpb24oXCJ3aG9sZUxpbmVVcGRhdGVCZWZvcmVcIiwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwidGhlbWVcIiwgXCJkZWZhdWx0XCIsIGZ1bmN0aW9uKGNtKSB7XG4gICAgdGhlbWVDaGFuZ2VkKGNtKTtcbiAgICBndXR0ZXJzQ2hhbmdlZChjbSk7XG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJrZXlNYXBcIiwgXCJkZWZhdWx0XCIsIGZ1bmN0aW9uKGNtLCB2YWwsIG9sZCkge1xuICAgIHZhciBuZXh0ID0gZ2V0S2V5TWFwKHZhbCk7XG4gICAgdmFyIHByZXYgPSBvbGQgIT0gQ29kZU1pcnJvci5Jbml0ICYmIGdldEtleU1hcChvbGQpO1xuICAgIGlmIChwcmV2ICYmIHByZXYuZGV0YWNoKSBwcmV2LmRldGFjaChjbSwgbmV4dCk7XG4gICAgaWYgKG5leHQuYXR0YWNoKSBuZXh0LmF0dGFjaChjbSwgcHJldiB8fCBudWxsKTtcbiAgfSk7XG4gIG9wdGlvbihcImV4dHJhS2V5c1wiLCBudWxsKTtcblxuICBvcHRpb24oXCJsaW5lV3JhcHBpbmdcIiwgZmFsc2UsIHdyYXBwaW5nQ2hhbmdlZCwgdHJ1ZSk7XG4gIG9wdGlvbihcImd1dHRlcnNcIiwgW10sIGZ1bmN0aW9uKGNtKSB7XG4gICAgc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKGNtLm9wdGlvbnMpO1xuICAgIGd1dHRlcnNDaGFuZ2VkKGNtKTtcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImZpeGVkR3V0dGVyXCIsIHRydWUsIGZ1bmN0aW9uKGNtLCB2YWwpIHtcbiAgICBjbS5kaXNwbGF5Lmd1dHRlcnMuc3R5bGUubGVmdCA9IHZhbCA/IGNvbXBlbnNhdGVGb3JIU2Nyb2xsKGNtLmRpc3BsYXkpICsgXCJweFwiIDogXCIwXCI7XG4gICAgY20ucmVmcmVzaCgpO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwiY292ZXJHdXR0ZXJOZXh0VG9TY3JvbGxiYXJcIiwgZmFsc2UsIGZ1bmN0aW9uKGNtKSB7dXBkYXRlU2Nyb2xsYmFycyhjbSk7fSwgdHJ1ZSk7XG4gIG9wdGlvbihcInNjcm9sbGJhclN0eWxlXCIsIFwibmF0aXZlXCIsIGZ1bmN0aW9uKGNtKSB7XG4gICAgaW5pdFNjcm9sbGJhcnMoY20pO1xuICAgIHVwZGF0ZVNjcm9sbGJhcnMoY20pO1xuICAgIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxUb3AoY20uZG9jLnNjcm9sbFRvcCk7XG4gICAgY20uZGlzcGxheS5zY3JvbGxiYXJzLnNldFNjcm9sbExlZnQoY20uZG9jLnNjcm9sbExlZnQpO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwibGluZU51bWJlcnNcIiwgZmFsc2UsIGZ1bmN0aW9uKGNtKSB7XG4gICAgc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKGNtLm9wdGlvbnMpO1xuICAgIGd1dHRlcnNDaGFuZ2VkKGNtKTtcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImZpcnN0TGluZU51bWJlclwiLCAxLCBndXR0ZXJzQ2hhbmdlZCwgdHJ1ZSk7XG4gIG9wdGlvbihcImxpbmVOdW1iZXJGb3JtYXR0ZXJcIiwgZnVuY3Rpb24oaW50ZWdlcikge3JldHVybiBpbnRlZ2VyO30sIGd1dHRlcnNDaGFuZ2VkLCB0cnVlKTtcbiAgb3B0aW9uKFwic2hvd0N1cnNvcldoZW5TZWxlY3RpbmdcIiwgZmFsc2UsIHVwZGF0ZVNlbGVjdGlvbiwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwicmVzZXRTZWxlY3Rpb25PbkNvbnRleHRNZW51XCIsIHRydWUpO1xuICBvcHRpb24oXCJsaW5lV2lzZUNvcHlDdXRcIiwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwicmVhZE9ubHlcIiwgZmFsc2UsIGZ1bmN0aW9uKGNtLCB2YWwpIHtcbiAgICBpZiAodmFsID09IFwibm9jdXJzb3JcIikge1xuICAgICAgb25CbHVyKGNtKTtcbiAgICAgIGNtLmRpc3BsYXkuaW5wdXQuYmx1cigpO1xuICAgICAgY20uZGlzcGxheS5kaXNhYmxlZCA9IHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNtLmRpc3BsYXkuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgY20uZGlzcGxheS5pbnB1dC5yZWFkT25seUNoYW5nZWQodmFsKVxuICB9KTtcbiAgb3B0aW9uKFwiZGlzYWJsZUlucHV0XCIsIGZhbHNlLCBmdW5jdGlvbihjbSwgdmFsKSB7aWYgKCF2YWwpIGNtLmRpc3BsYXkuaW5wdXQucmVzZXQoKTt9LCB0cnVlKTtcbiAgb3B0aW9uKFwiZHJhZ0Ryb3BcIiwgdHJ1ZSwgZHJhZ0Ryb3BDaGFuZ2VkKTtcbiAgb3B0aW9uKFwiYWxsb3dEcm9wRmlsZVR5cGVzXCIsIG51bGwpO1xuXG4gIG9wdGlvbihcImN1cnNvckJsaW5rUmF0ZVwiLCA1MzApO1xuICBvcHRpb24oXCJjdXJzb3JTY3JvbGxNYXJnaW5cIiwgMCk7XG4gIG9wdGlvbihcImN1cnNvckhlaWdodFwiLCAxLCB1cGRhdGVTZWxlY3Rpb24sIHRydWUpO1xuICBvcHRpb24oXCJzaW5nbGVDdXJzb3JIZWlnaHRQZXJMaW5lXCIsIHRydWUsIHVwZGF0ZVNlbGVjdGlvbiwgdHJ1ZSk7XG4gIG9wdGlvbihcIndvcmtUaW1lXCIsIDEwMCk7XG4gIG9wdGlvbihcIndvcmtEZWxheVwiLCAxMDApO1xuICBvcHRpb24oXCJmbGF0dGVuU3BhbnNcIiwgdHJ1ZSwgcmVzZXRNb2RlU3RhdGUsIHRydWUpO1xuICBvcHRpb24oXCJhZGRNb2RlQ2xhc3NcIiwgZmFsc2UsIHJlc2V0TW9kZVN0YXRlLCB0cnVlKTtcbiAgb3B0aW9uKFwicG9sbEludGVydmFsXCIsIDEwMCk7XG4gIG9wdGlvbihcInVuZG9EZXB0aFwiLCAyMDAsIGZ1bmN0aW9uKGNtLCB2YWwpe2NtLmRvYy5oaXN0b3J5LnVuZG9EZXB0aCA9IHZhbDt9KTtcbiAgb3B0aW9uKFwiaGlzdG9yeUV2ZW50RGVsYXlcIiwgMTI1MCk7XG4gIG9wdGlvbihcInZpZXdwb3J0TWFyZ2luXCIsIDEwLCBmdW5jdGlvbihjbSl7Y20ucmVmcmVzaCgpO30sIHRydWUpO1xuICBvcHRpb24oXCJtYXhIaWdobGlnaHRMZW5ndGhcIiwgMTAwMDAsIHJlc2V0TW9kZVN0YXRlLCB0cnVlKTtcbiAgb3B0aW9uKFwibW92ZUlucHV0V2l0aEN1cnNvclwiLCB0cnVlLCBmdW5jdGlvbihjbSwgdmFsKSB7XG4gICAgaWYgKCF2YWwpIGNtLmRpc3BsYXkuaW5wdXQucmVzZXRQb3NpdGlvbigpO1xuICB9KTtcblxuICBvcHRpb24oXCJ0YWJpbmRleFwiLCBudWxsLCBmdW5jdGlvbihjbSwgdmFsKSB7XG4gICAgY20uZGlzcGxheS5pbnB1dC5nZXRGaWVsZCgpLnRhYkluZGV4ID0gdmFsIHx8IFwiXCI7XG4gIH0pO1xuICBvcHRpb24oXCJhdXRvZm9jdXNcIiwgbnVsbCk7XG5cbiAgLy8gTU9ERSBERUZJTklUSU9OIEFORCBRVUVSWUlOR1xuXG4gIC8vIEtub3duIG1vZGVzLCBieSBuYW1lIGFuZCBieSBNSU1FXG4gIHZhciBtb2RlcyA9IENvZGVNaXJyb3IubW9kZXMgPSB7fSwgbWltZU1vZGVzID0gQ29kZU1pcnJvci5taW1lTW9kZXMgPSB7fTtcblxuICAvLyBFeHRyYSBhcmd1bWVudHMgYXJlIHN0b3JlZCBhcyB0aGUgbW9kZSdzIGRlcGVuZGVuY2llcywgd2hpY2ggaXNcbiAgLy8gdXNlZCBieSAobGVnYWN5KSBtZWNoYW5pc21zIGxpa2UgbG9hZG1vZGUuanMgdG8gYXV0b21hdGljYWxseVxuICAvLyBsb2FkIGEgbW9kZS4gKFByZWZlcnJlZCBtZWNoYW5pc20gaXMgdGhlIHJlcXVpcmUvZGVmaW5lIGNhbGxzLilcbiAgQ29kZU1pcnJvci5kZWZpbmVNb2RlID0gZnVuY3Rpb24obmFtZSwgbW9kZSkge1xuICAgIGlmICghQ29kZU1pcnJvci5kZWZhdWx0cy5tb2RlICYmIG5hbWUgIT0gXCJudWxsXCIpIENvZGVNaXJyb3IuZGVmYXVsdHMubW9kZSA9IG5hbWU7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyKVxuICAgICAgbW9kZS5kZXBlbmRlbmNpZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIG1vZGVzW25hbWVdID0gbW9kZTtcbiAgfTtcblxuICBDb2RlTWlycm9yLmRlZmluZU1JTUUgPSBmdW5jdGlvbihtaW1lLCBzcGVjKSB7XG4gICAgbWltZU1vZGVzW21pbWVdID0gc3BlYztcbiAgfTtcblxuICAvLyBHaXZlbiBhIE1JTUUgdHlwZSwgYSB7bmFtZSwgLi4ub3B0aW9uc30gY29uZmlnIG9iamVjdCwgb3IgYSBuYW1lXG4gIC8vIHN0cmluZywgcmV0dXJuIGEgbW9kZSBjb25maWcgb2JqZWN0LlxuICBDb2RlTWlycm9yLnJlc29sdmVNb2RlID0gZnVuY3Rpb24oc3BlYykge1xuICAgIGlmICh0eXBlb2Ygc3BlYyA9PSBcInN0cmluZ1wiICYmIG1pbWVNb2Rlcy5oYXNPd25Qcm9wZXJ0eShzcGVjKSkge1xuICAgICAgc3BlYyA9IG1pbWVNb2Rlc1tzcGVjXTtcbiAgICB9IGVsc2UgaWYgKHNwZWMgJiYgdHlwZW9mIHNwZWMubmFtZSA9PSBcInN0cmluZ1wiICYmIG1pbWVNb2Rlcy5oYXNPd25Qcm9wZXJ0eShzcGVjLm5hbWUpKSB7XG4gICAgICB2YXIgZm91bmQgPSBtaW1lTW9kZXNbc3BlYy5uYW1lXTtcbiAgICAgIGlmICh0eXBlb2YgZm91bmQgPT0gXCJzdHJpbmdcIikgZm91bmQgPSB7bmFtZTogZm91bmR9O1xuICAgICAgc3BlYyA9IGNyZWF0ZU9iaihmb3VuZCwgc3BlYyk7XG4gICAgICBzcGVjLm5hbWUgPSBmb3VuZC5uYW1lO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIiAmJiAvXltcXHdcXC1dK1xcL1tcXHdcXC1dK1xcK3htbCQvLnRlc3Qoc3BlYykpIHtcbiAgICAgIHJldHVybiBDb2RlTWlycm9yLnJlc29sdmVNb2RlKFwiYXBwbGljYXRpb24veG1sXCIpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIikgcmV0dXJuIHtuYW1lOiBzcGVjfTtcbiAgICBlbHNlIHJldHVybiBzcGVjIHx8IHtuYW1lOiBcIm51bGxcIn07XG4gIH07XG5cbiAgLy8gR2l2ZW4gYSBtb2RlIHNwZWMgKGFueXRoaW5nIHRoYXQgcmVzb2x2ZU1vZGUgYWNjZXB0cyksIGZpbmQgYW5kXG4gIC8vIGluaXRpYWxpemUgYW4gYWN0dWFsIG1vZGUgb2JqZWN0LlxuICBDb2RlTWlycm9yLmdldE1vZGUgPSBmdW5jdGlvbihvcHRpb25zLCBzcGVjKSB7XG4gICAgdmFyIHNwZWMgPSBDb2RlTWlycm9yLnJlc29sdmVNb2RlKHNwZWMpO1xuICAgIHZhciBtZmFjdG9yeSA9IG1vZGVzW3NwZWMubmFtZV07XG4gICAgaWYgKCFtZmFjdG9yeSkgcmV0dXJuIENvZGVNaXJyb3IuZ2V0TW9kZShvcHRpb25zLCBcInRleHQvcGxhaW5cIik7XG4gICAgdmFyIG1vZGVPYmogPSBtZmFjdG9yeShvcHRpb25zLCBzcGVjKTtcbiAgICBpZiAobW9kZUV4dGVuc2lvbnMuaGFzT3duUHJvcGVydHkoc3BlYy5uYW1lKSkge1xuICAgICAgdmFyIGV4dHMgPSBtb2RlRXh0ZW5zaW9uc1tzcGVjLm5hbWVdO1xuICAgICAgZm9yICh2YXIgcHJvcCBpbiBleHRzKSB7XG4gICAgICAgIGlmICghZXh0cy5oYXNPd25Qcm9wZXJ0eShwcm9wKSkgY29udGludWU7XG4gICAgICAgIGlmIChtb2RlT2JqLmhhc093blByb3BlcnR5KHByb3ApKSBtb2RlT2JqW1wiX1wiICsgcHJvcF0gPSBtb2RlT2JqW3Byb3BdO1xuICAgICAgICBtb2RlT2JqW3Byb3BdID0gZXh0c1twcm9wXTtcbiAgICAgIH1cbiAgICB9XG4gICAgbW9kZU9iai5uYW1lID0gc3BlYy5uYW1lO1xuICAgIGlmIChzcGVjLmhlbHBlclR5cGUpIG1vZGVPYmouaGVscGVyVHlwZSA9IHNwZWMuaGVscGVyVHlwZTtcbiAgICBpZiAoc3BlYy5tb2RlUHJvcHMpIGZvciAodmFyIHByb3AgaW4gc3BlYy5tb2RlUHJvcHMpXG4gICAgICBtb2RlT2JqW3Byb3BdID0gc3BlYy5tb2RlUHJvcHNbcHJvcF07XG5cbiAgICByZXR1cm4gbW9kZU9iajtcbiAgfTtcblxuICAvLyBNaW5pbWFsIGRlZmF1bHQgbW9kZS5cbiAgQ29kZU1pcnJvci5kZWZpbmVNb2RlKFwibnVsbFwiLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge3Rva2VuOiBmdW5jdGlvbihzdHJlYW0pIHtzdHJlYW0uc2tpcFRvRW5kKCk7fX07XG4gIH0pO1xuICBDb2RlTWlycm9yLmRlZmluZU1JTUUoXCJ0ZXh0L3BsYWluXCIsIFwibnVsbFwiKTtcblxuICAvLyBUaGlzIGNhbiBiZSB1c2VkIHRvIGF0dGFjaCBwcm9wZXJ0aWVzIHRvIG1vZGUgb2JqZWN0cyBmcm9tXG4gIC8vIG91dHNpZGUgdGhlIGFjdHVhbCBtb2RlIGRlZmluaXRpb24uXG4gIHZhciBtb2RlRXh0ZW5zaW9ucyA9IENvZGVNaXJyb3IubW9kZUV4dGVuc2lvbnMgPSB7fTtcbiAgQ29kZU1pcnJvci5leHRlbmRNb2RlID0gZnVuY3Rpb24obW9kZSwgcHJvcGVydGllcykge1xuICAgIHZhciBleHRzID0gbW9kZUV4dGVuc2lvbnMuaGFzT3duUHJvcGVydHkobW9kZSkgPyBtb2RlRXh0ZW5zaW9uc1ttb2RlXSA6IChtb2RlRXh0ZW5zaW9uc1ttb2RlXSA9IHt9KTtcbiAgICBjb3B5T2JqKHByb3BlcnRpZXMsIGV4dHMpO1xuICB9O1xuXG4gIC8vIEVYVEVOU0lPTlNcblxuICBDb2RlTWlycm9yLmRlZmluZUV4dGVuc2lvbiA9IGZ1bmN0aW9uKG5hbWUsIGZ1bmMpIHtcbiAgICBDb2RlTWlycm9yLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmM7XG4gIH07XG4gIENvZGVNaXJyb3IuZGVmaW5lRG9jRXh0ZW5zaW9uID0gZnVuY3Rpb24obmFtZSwgZnVuYykge1xuICAgIERvYy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jO1xuICB9O1xuICBDb2RlTWlycm9yLmRlZmluZU9wdGlvbiA9IG9wdGlvbjtcblxuICB2YXIgaW5pdEhvb2tzID0gW107XG4gIENvZGVNaXJyb3IuZGVmaW5lSW5pdEhvb2sgPSBmdW5jdGlvbihmKSB7aW5pdEhvb2tzLnB1c2goZik7fTtcblxuICB2YXIgaGVscGVycyA9IENvZGVNaXJyb3IuaGVscGVycyA9IHt9O1xuICBDb2RlTWlycm9yLnJlZ2lzdGVySGVscGVyID0gZnVuY3Rpb24odHlwZSwgbmFtZSwgdmFsdWUpIHtcbiAgICBpZiAoIWhlbHBlcnMuaGFzT3duUHJvcGVydHkodHlwZSkpIGhlbHBlcnNbdHlwZV0gPSBDb2RlTWlycm9yW3R5cGVdID0ge19nbG9iYWw6IFtdfTtcbiAgICBoZWxwZXJzW3R5cGVdW25hbWVdID0gdmFsdWU7XG4gIH07XG4gIENvZGVNaXJyb3IucmVnaXN0ZXJHbG9iYWxIZWxwZXIgPSBmdW5jdGlvbih0eXBlLCBuYW1lLCBwcmVkaWNhdGUsIHZhbHVlKSB7XG4gICAgQ29kZU1pcnJvci5yZWdpc3RlckhlbHBlcih0eXBlLCBuYW1lLCB2YWx1ZSk7XG4gICAgaGVscGVyc1t0eXBlXS5fZ2xvYmFsLnB1c2goe3ByZWQ6IHByZWRpY2F0ZSwgdmFsOiB2YWx1ZX0pO1xuICB9O1xuXG4gIC8vIE1PREUgU1RBVEUgSEFORExJTkdcblxuICAvLyBVdGlsaXR5IGZ1bmN0aW9ucyBmb3Igd29ya2luZyB3aXRoIHN0YXRlLiBFeHBvcnRlZCBiZWNhdXNlIG5lc3RlZFxuICAvLyBtb2RlcyBuZWVkIHRvIGRvIHRoaXMgZm9yIHRoZWlyIGlubmVyIG1vZGVzLlxuXG4gIHZhciBjb3B5U3RhdGUgPSBDb2RlTWlycm9yLmNvcHlTdGF0ZSA9IGZ1bmN0aW9uKG1vZGUsIHN0YXRlKSB7XG4gICAgaWYgKHN0YXRlID09PSB0cnVlKSByZXR1cm4gc3RhdGU7XG4gICAgaWYgKG1vZGUuY29weVN0YXRlKSByZXR1cm4gbW9kZS5jb3B5U3RhdGUoc3RhdGUpO1xuICAgIHZhciBuc3RhdGUgPSB7fTtcbiAgICBmb3IgKHZhciBuIGluIHN0YXRlKSB7XG4gICAgICB2YXIgdmFsID0gc3RhdGVbbl07XG4gICAgICBpZiAodmFsIGluc3RhbmNlb2YgQXJyYXkpIHZhbCA9IHZhbC5jb25jYXQoW10pO1xuICAgICAgbnN0YXRlW25dID0gdmFsO1xuICAgIH1cbiAgICByZXR1cm4gbnN0YXRlO1xuICB9O1xuXG4gIHZhciBzdGFydFN0YXRlID0gQ29kZU1pcnJvci5zdGFydFN0YXRlID0gZnVuY3Rpb24obW9kZSwgYTEsIGEyKSB7XG4gICAgcmV0dXJuIG1vZGUuc3RhcnRTdGF0ZSA/IG1vZGUuc3RhcnRTdGF0ZShhMSwgYTIpIDogdHJ1ZTtcbiAgfTtcblxuICAvLyBHaXZlbiBhIG1vZGUgYW5kIGEgc3RhdGUgKGZvciB0aGF0IG1vZGUpLCBmaW5kIHRoZSBpbm5lciBtb2RlIGFuZFxuICAvLyBzdGF0ZSBhdCB0aGUgcG9zaXRpb24gdGhhdCB0aGUgc3RhdGUgcmVmZXJzIHRvLlxuICBDb2RlTWlycm9yLmlubmVyTW9kZSA9IGZ1bmN0aW9uKG1vZGUsIHN0YXRlKSB7XG4gICAgd2hpbGUgKG1vZGUuaW5uZXJNb2RlKSB7XG4gICAgICB2YXIgaW5mbyA9IG1vZGUuaW5uZXJNb2RlKHN0YXRlKTtcbiAgICAgIGlmICghaW5mbyB8fCBpbmZvLm1vZGUgPT0gbW9kZSkgYnJlYWs7XG4gICAgICBzdGF0ZSA9IGluZm8uc3RhdGU7XG4gICAgICBtb2RlID0gaW5mby5tb2RlO1xuICAgIH1cbiAgICByZXR1cm4gaW5mbyB8fCB7bW9kZTogbW9kZSwgc3RhdGU6IHN0YXRlfTtcbiAgfTtcblxuICAvLyBTVEFOREFSRCBDT01NQU5EU1xuXG4gIC8vIENvbW1hbmRzIGFyZSBwYXJhbWV0ZXItbGVzcyBhY3Rpb25zIHRoYXQgY2FuIGJlIHBlcmZvcm1lZCBvbiBhblxuICAvLyBlZGl0b3IsIG1vc3RseSB1c2VkIGZvciBrZXliaW5kaW5ncy5cbiAgdmFyIGNvbW1hbmRzID0gQ29kZU1pcnJvci5jb21tYW5kcyA9IHtcbiAgICBzZWxlY3RBbGw6IGZ1bmN0aW9uKGNtKSB7Y20uc2V0U2VsZWN0aW9uKFBvcyhjbS5maXJzdExpbmUoKSwgMCksIFBvcyhjbS5sYXN0TGluZSgpKSwgc2VsX2RvbnRTY3JvbGwpO30sXG4gICAgc2luZ2xlU2VsZWN0aW9uOiBmdW5jdGlvbihjbSkge1xuICAgICAgY20uc2V0U2VsZWN0aW9uKGNtLmdldEN1cnNvcihcImFuY2hvclwiKSwgY20uZ2V0Q3Vyc29yKFwiaGVhZFwiKSwgc2VsX2RvbnRTY3JvbGwpO1xuICAgIH0sXG4gICAga2lsbExpbmU6IGZ1bmN0aW9uKGNtKSB7XG4gICAgICBkZWxldGVOZWFyU2VsZWN0aW9uKGNtLCBmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICBpZiAocmFuZ2UuZW1wdHkoKSkge1xuICAgICAgICAgIHZhciBsZW4gPSBnZXRMaW5lKGNtLmRvYywgcmFuZ2UuaGVhZC5saW5lKS50ZXh0Lmxlbmd0aDtcbiAgICAgICAgICBpZiAocmFuZ2UuaGVhZC5jaCA9PSBsZW4gJiYgcmFuZ2UuaGVhZC5saW5lIDwgY20ubGFzdExpbmUoKSlcbiAgICAgICAgICAgIHJldHVybiB7ZnJvbTogcmFuZ2UuaGVhZCwgdG86IFBvcyhyYW5nZS5oZWFkLmxpbmUgKyAxLCAwKX07XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIHtmcm9tOiByYW5nZS5oZWFkLCB0bzogUG9zKHJhbmdlLmhlYWQubGluZSwgbGVuKX07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHtmcm9tOiByYW5nZS5mcm9tKCksIHRvOiByYW5nZS50bygpfTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSxcbiAgICBkZWxldGVMaW5lOiBmdW5jdGlvbihjbSkge1xuICAgICAgZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHtmcm9tOiBQb3MocmFuZ2UuZnJvbSgpLmxpbmUsIDApLFxuICAgICAgICAgICAgICAgIHRvOiBjbGlwUG9zKGNtLmRvYywgUG9zKHJhbmdlLnRvKCkubGluZSArIDEsIDApKX07XG4gICAgICB9KTtcbiAgICB9LFxuICAgIGRlbExpbmVMZWZ0OiBmdW5jdGlvbihjbSkge1xuICAgICAgZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHtmcm9tOiBQb3MocmFuZ2UuZnJvbSgpLmxpbmUsIDApLCB0bzogcmFuZ2UuZnJvbSgpfTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgZGVsV3JhcHBlZExpbmVMZWZ0OiBmdW5jdGlvbihjbSkge1xuICAgICAgZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgdmFyIHRvcCA9IGNtLmNoYXJDb29yZHMocmFuZ2UuaGVhZCwgXCJkaXZcIikudG9wICsgNTtcbiAgICAgICAgdmFyIGxlZnRQb3MgPSBjbS5jb29yZHNDaGFyKHtsZWZ0OiAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpO1xuICAgICAgICByZXR1cm4ge2Zyb206IGxlZnRQb3MsIHRvOiByYW5nZS5mcm9tKCl9O1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBkZWxXcmFwcGVkTGluZVJpZ2h0OiBmdW5jdGlvbihjbSkge1xuICAgICAgZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgdmFyIHRvcCA9IGNtLmNoYXJDb29yZHMocmFuZ2UuaGVhZCwgXCJkaXZcIikudG9wICsgNTtcbiAgICAgICAgdmFyIHJpZ2h0UG9zID0gY20uY29vcmRzQ2hhcih7bGVmdDogY20uZGlzcGxheS5saW5lRGl2Lm9mZnNldFdpZHRoICsgMTAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpO1xuICAgICAgICByZXR1cm4ge2Zyb206IHJhbmdlLmZyb20oKSwgdG86IHJpZ2h0UG9zIH07XG4gICAgICB9KTtcbiAgICB9LFxuICAgIHVuZG86IGZ1bmN0aW9uKGNtKSB7Y20udW5kbygpO30sXG4gICAgcmVkbzogZnVuY3Rpb24oY20pIHtjbS5yZWRvKCk7fSxcbiAgICB1bmRvU2VsZWN0aW9uOiBmdW5jdGlvbihjbSkge2NtLnVuZG9TZWxlY3Rpb24oKTt9LFxuICAgIHJlZG9TZWxlY3Rpb246IGZ1bmN0aW9uKGNtKSB7Y20ucmVkb1NlbGVjdGlvbigpO30sXG4gICAgZ29Eb2NTdGFydDogZnVuY3Rpb24oY20pIHtjbS5leHRlbmRTZWxlY3Rpb24oUG9zKGNtLmZpcnN0TGluZSgpLCAwKSk7fSxcbiAgICBnb0RvY0VuZDogZnVuY3Rpb24oY20pIHtjbS5leHRlbmRTZWxlY3Rpb24oUG9zKGNtLmxhc3RMaW5lKCkpKTt9LFxuICAgIGdvTGluZVN0YXJ0OiBmdW5jdGlvbihjbSkge1xuICAgICAgY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uKHJhbmdlKSB7IHJldHVybiBsaW5lU3RhcnQoY20sIHJhbmdlLmhlYWQubGluZSk7IH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAge29yaWdpbjogXCIrbW92ZVwiLCBiaWFzOiAxfSk7XG4gICAgfSxcbiAgICBnb0xpbmVTdGFydFNtYXJ0OiBmdW5jdGlvbihjbSkge1xuICAgICAgY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgIHJldHVybiBsaW5lU3RhcnRTbWFydChjbSwgcmFuZ2UuaGVhZCk7XG4gICAgICB9LCB7b3JpZ2luOiBcIittb3ZlXCIsIGJpYXM6IDF9KTtcbiAgICB9LFxuICAgIGdvTGluZUVuZDogZnVuY3Rpb24oY20pIHtcbiAgICAgIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbihyYW5nZSkgeyByZXR1cm4gbGluZUVuZChjbSwgcmFuZ2UuaGVhZC5saW5lKTsgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB7b3JpZ2luOiBcIittb3ZlXCIsIGJpYXM6IC0xfSk7XG4gICAgfSxcbiAgICBnb0xpbmVSaWdodDogZnVuY3Rpb24oY20pIHtcbiAgICAgIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICB2YXIgdG9wID0gY20uY2hhckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgICAgICByZXR1cm4gY20uY29vcmRzQ2hhcih7bGVmdDogY20uZGlzcGxheS5saW5lRGl2Lm9mZnNldFdpZHRoICsgMTAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpO1xuICAgICAgfSwgc2VsX21vdmUpO1xuICAgIH0sXG4gICAgZ29MaW5lTGVmdDogZnVuY3Rpb24oY20pIHtcbiAgICAgIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICB2YXIgdG9wID0gY20uY2hhckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgICAgICByZXR1cm4gY20uY29vcmRzQ2hhcih7bGVmdDogMCwgdG9wOiB0b3B9LCBcImRpdlwiKTtcbiAgICAgIH0sIHNlbF9tb3ZlKTtcbiAgICB9LFxuICAgIGdvTGluZUxlZnRTbWFydDogZnVuY3Rpb24oY20pIHtcbiAgICAgIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICB2YXIgdG9wID0gY20uY2hhckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgICAgICB2YXIgcG9zID0gY20uY29vcmRzQ2hhcih7bGVmdDogMCwgdG9wOiB0b3B9LCBcImRpdlwiKTtcbiAgICAgICAgaWYgKHBvcy5jaCA8IGNtLmdldExpbmUocG9zLmxpbmUpLnNlYXJjaCgvXFxTLykpIHJldHVybiBsaW5lU3RhcnRTbWFydChjbSwgcmFuZ2UuaGVhZCk7XG4gICAgICAgIHJldHVybiBwb3M7XG4gICAgICB9LCBzZWxfbW92ZSk7XG4gICAgfSxcbiAgICBnb0xpbmVVcDogZnVuY3Rpb24oY20pIHtjbS5tb3ZlVigtMSwgXCJsaW5lXCIpO30sXG4gICAgZ29MaW5lRG93bjogZnVuY3Rpb24oY20pIHtjbS5tb3ZlVigxLCBcImxpbmVcIik7fSxcbiAgICBnb1BhZ2VVcDogZnVuY3Rpb24oY20pIHtjbS5tb3ZlVigtMSwgXCJwYWdlXCIpO30sXG4gICAgZ29QYWdlRG93bjogZnVuY3Rpb24oY20pIHtjbS5tb3ZlVigxLCBcInBhZ2VcIik7fSxcbiAgICBnb0NoYXJMZWZ0OiBmdW5jdGlvbihjbSkge2NtLm1vdmVIKC0xLCBcImNoYXJcIik7fSxcbiAgICBnb0NoYXJSaWdodDogZnVuY3Rpb24oY20pIHtjbS5tb3ZlSCgxLCBcImNoYXJcIik7fSxcbiAgICBnb0NvbHVtbkxlZnQ6IGZ1bmN0aW9uKGNtKSB7Y20ubW92ZUgoLTEsIFwiY29sdW1uXCIpO30sXG4gICAgZ29Db2x1bW5SaWdodDogZnVuY3Rpb24oY20pIHtjbS5tb3ZlSCgxLCBcImNvbHVtblwiKTt9LFxuICAgIGdvV29yZExlZnQ6IGZ1bmN0aW9uKGNtKSB7Y20ubW92ZUgoLTEsIFwid29yZFwiKTt9LFxuICAgIGdvR3JvdXBSaWdodDogZnVuY3Rpb24oY20pIHtjbS5tb3ZlSCgxLCBcImdyb3VwXCIpO30sXG4gICAgZ29Hcm91cExlZnQ6IGZ1bmN0aW9uKGNtKSB7Y20ubW92ZUgoLTEsIFwiZ3JvdXBcIik7fSxcbiAgICBnb1dvcmRSaWdodDogZnVuY3Rpb24oY20pIHtjbS5tb3ZlSCgxLCBcIndvcmRcIik7fSxcbiAgICBkZWxDaGFyQmVmb3JlOiBmdW5jdGlvbihjbSkge2NtLmRlbGV0ZUgoLTEsIFwiY2hhclwiKTt9LFxuICAgIGRlbENoYXJBZnRlcjogZnVuY3Rpb24oY20pIHtjbS5kZWxldGVIKDEsIFwiY2hhclwiKTt9LFxuICAgIGRlbFdvcmRCZWZvcmU6IGZ1bmN0aW9uKGNtKSB7Y20uZGVsZXRlSCgtMSwgXCJ3b3JkXCIpO30sXG4gICAgZGVsV29yZEFmdGVyOiBmdW5jdGlvbihjbSkge2NtLmRlbGV0ZUgoMSwgXCJ3b3JkXCIpO30sXG4gICAgZGVsR3JvdXBCZWZvcmU6IGZ1bmN0aW9uKGNtKSB7Y20uZGVsZXRlSCgtMSwgXCJncm91cFwiKTt9LFxuICAgIGRlbEdyb3VwQWZ0ZXI6IGZ1bmN0aW9uKGNtKSB7Y20uZGVsZXRlSCgxLCBcImdyb3VwXCIpO30sXG4gICAgaW5kZW50QXV0bzogZnVuY3Rpb24oY20pIHtjbS5pbmRlbnRTZWxlY3Rpb24oXCJzbWFydFwiKTt9LFxuICAgIGluZGVudE1vcmU6IGZ1bmN0aW9uKGNtKSB7Y20uaW5kZW50U2VsZWN0aW9uKFwiYWRkXCIpO30sXG4gICAgaW5kZW50TGVzczogZnVuY3Rpb24oY20pIHtjbS5pbmRlbnRTZWxlY3Rpb24oXCJzdWJ0cmFjdFwiKTt9LFxuICAgIGluc2VydFRhYjogZnVuY3Rpb24oY20pIHtjbS5yZXBsYWNlU2VsZWN0aW9uKFwiXFx0XCIpO30sXG4gICAgaW5zZXJ0U29mdFRhYjogZnVuY3Rpb24oY20pIHtcbiAgICAgIHZhciBzcGFjZXMgPSBbXSwgcmFuZ2VzID0gY20ubGlzdFNlbGVjdGlvbnMoKSwgdGFiU2l6ZSA9IGNtLm9wdGlvbnMudGFiU2l6ZTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBwb3MgPSByYW5nZXNbaV0uZnJvbSgpO1xuICAgICAgICB2YXIgY29sID0gY291bnRDb2x1bW4oY20uZ2V0TGluZShwb3MubGluZSksIHBvcy5jaCwgdGFiU2l6ZSk7XG4gICAgICAgIHNwYWNlcy5wdXNoKG5ldyBBcnJheSh0YWJTaXplIC0gY29sICUgdGFiU2l6ZSArIDEpLmpvaW4oXCIgXCIpKTtcbiAgICAgIH1cbiAgICAgIGNtLnJlcGxhY2VTZWxlY3Rpb25zKHNwYWNlcyk7XG4gICAgfSxcbiAgICBkZWZhdWx0VGFiOiBmdW5jdGlvbihjbSkge1xuICAgICAgaWYgKGNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIGNtLmluZGVudFNlbGVjdGlvbihcImFkZFwiKTtcbiAgICAgIGVsc2UgY20uZXhlY0NvbW1hbmQoXCJpbnNlcnRUYWJcIik7XG4gICAgfSxcbiAgICB0cmFuc3Bvc2VDaGFyczogZnVuY3Rpb24oY20pIHtcbiAgICAgIHJ1bkluT3AoY20sIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcmFuZ2VzID0gY20ubGlzdFNlbGVjdGlvbnMoKSwgbmV3U2VsID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdmFyIGN1ciA9IHJhbmdlc1tpXS5oZWFkLCBsaW5lID0gZ2V0TGluZShjbS5kb2MsIGN1ci5saW5lKS50ZXh0O1xuICAgICAgICAgIGlmIChsaW5lKSB7XG4gICAgICAgICAgICBpZiAoY3VyLmNoID09IGxpbmUubGVuZ3RoKSBjdXIgPSBuZXcgUG9zKGN1ci5saW5lLCBjdXIuY2ggLSAxKTtcbiAgICAgICAgICAgIGlmIChjdXIuY2ggPiAwKSB7XG4gICAgICAgICAgICAgIGN1ciA9IG5ldyBQb3MoY3VyLmxpbmUsIGN1ci5jaCArIDEpO1xuICAgICAgICAgICAgICBjbS5yZXBsYWNlUmFuZ2UobGluZS5jaGFyQXQoY3VyLmNoIC0gMSkgKyBsaW5lLmNoYXJBdChjdXIuY2ggLSAyKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFBvcyhjdXIubGluZSwgY3VyLmNoIC0gMiksIGN1ciwgXCIrdHJhbnNwb3NlXCIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjdXIubGluZSA+IGNtLmRvYy5maXJzdCkge1xuICAgICAgICAgICAgICB2YXIgcHJldiA9IGdldExpbmUoY20uZG9jLCBjdXIubGluZSAtIDEpLnRleHQ7XG4gICAgICAgICAgICAgIGlmIChwcmV2KVxuICAgICAgICAgICAgICAgIGNtLnJlcGxhY2VSYW5nZShsaW5lLmNoYXJBdCgwKSArIGNtLmRvYy5saW5lU2VwYXJhdG9yKCkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2LmNoYXJBdChwcmV2Lmxlbmd0aCAtIDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBQb3MoY3VyLmxpbmUgLSAxLCBwcmV2Lmxlbmd0aCAtIDEpLCBQb3MoY3VyLmxpbmUsIDEpLCBcIit0cmFuc3Bvc2VcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG5ld1NlbC5wdXNoKG5ldyBSYW5nZShjdXIsIGN1cikpO1xuICAgICAgICB9XG4gICAgICAgIGNtLnNldFNlbGVjdGlvbnMobmV3U2VsKTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgbmV3bGluZUFuZEluZGVudDogZnVuY3Rpb24oY20pIHtcbiAgICAgIHJ1bkluT3AoY20sIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbGVuID0gY20ubGlzdFNlbGVjdGlvbnMoKS5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICB2YXIgcmFuZ2UgPSBjbS5saXN0U2VsZWN0aW9ucygpW2ldO1xuICAgICAgICAgIGNtLnJlcGxhY2VSYW5nZShjbS5kb2MubGluZVNlcGFyYXRvcigpLCByYW5nZS5hbmNob3IsIHJhbmdlLmhlYWQsIFwiK2lucHV0XCIpO1xuICAgICAgICAgIGNtLmluZGVudExpbmUocmFuZ2UuZnJvbSgpLmxpbmUgKyAxLCBudWxsLCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbnN1cmVDdXJzb3JWaXNpYmxlKGNtKTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgdG9nZ2xlT3ZlcndyaXRlOiBmdW5jdGlvbihjbSkge2NtLnRvZ2dsZU92ZXJ3cml0ZSgpO31cbiAgfTtcblxuXG4gIC8vIFNUQU5EQVJEIEtFWU1BUFNcblxuICB2YXIga2V5TWFwID0gQ29kZU1pcnJvci5rZXlNYXAgPSB7fTtcblxuICBrZXlNYXAuYmFzaWMgPSB7XG4gICAgXCJMZWZ0XCI6IFwiZ29DaGFyTGVmdFwiLCBcIlJpZ2h0XCI6IFwiZ29DaGFyUmlnaHRcIiwgXCJVcFwiOiBcImdvTGluZVVwXCIsIFwiRG93blwiOiBcImdvTGluZURvd25cIixcbiAgICBcIkVuZFwiOiBcImdvTGluZUVuZFwiLCBcIkhvbWVcIjogXCJnb0xpbmVTdGFydFNtYXJ0XCIsIFwiUGFnZVVwXCI6IFwiZ29QYWdlVXBcIiwgXCJQYWdlRG93blwiOiBcImdvUGFnZURvd25cIixcbiAgICBcIkRlbGV0ZVwiOiBcImRlbENoYXJBZnRlclwiLCBcIkJhY2tzcGFjZVwiOiBcImRlbENoYXJCZWZvcmVcIiwgXCJTaGlmdC1CYWNrc3BhY2VcIjogXCJkZWxDaGFyQmVmb3JlXCIsXG4gICAgXCJUYWJcIjogXCJkZWZhdWx0VGFiXCIsIFwiU2hpZnQtVGFiXCI6IFwiaW5kZW50QXV0b1wiLFxuICAgIFwiRW50ZXJcIjogXCJuZXdsaW5lQW5kSW5kZW50XCIsIFwiSW5zZXJ0XCI6IFwidG9nZ2xlT3ZlcndyaXRlXCIsXG4gICAgXCJFc2NcIjogXCJzaW5nbGVTZWxlY3Rpb25cIlxuICB9O1xuICAvLyBOb3RlIHRoYXQgdGhlIHNhdmUgYW5kIGZpbmQtcmVsYXRlZCBjb21tYW5kcyBhcmVuJ3QgZGVmaW5lZCBieVxuICAvLyBkZWZhdWx0LiBVc2VyIGNvZGUgb3IgYWRkb25zIGNhbiBkZWZpbmUgdGhlbS4gVW5rbm93biBjb21tYW5kc1xuICAvLyBhcmUgc2ltcGx5IGlnbm9yZWQuXG4gIGtleU1hcC5wY0RlZmF1bHQgPSB7XG4gICAgXCJDdHJsLUFcIjogXCJzZWxlY3RBbGxcIiwgXCJDdHJsLURcIjogXCJkZWxldGVMaW5lXCIsIFwiQ3RybC1aXCI6IFwidW5kb1wiLCBcIlNoaWZ0LUN0cmwtWlwiOiBcInJlZG9cIiwgXCJDdHJsLVlcIjogXCJyZWRvXCIsXG4gICAgXCJDdHJsLUhvbWVcIjogXCJnb0RvY1N0YXJ0XCIsIFwiQ3RybC1FbmRcIjogXCJnb0RvY0VuZFwiLCBcIkN0cmwtVXBcIjogXCJnb0xpbmVVcFwiLCBcIkN0cmwtRG93blwiOiBcImdvTGluZURvd25cIixcbiAgICBcIkN0cmwtTGVmdFwiOiBcImdvR3JvdXBMZWZ0XCIsIFwiQ3RybC1SaWdodFwiOiBcImdvR3JvdXBSaWdodFwiLCBcIkFsdC1MZWZ0XCI6IFwiZ29MaW5lU3RhcnRcIiwgXCJBbHQtUmlnaHRcIjogXCJnb0xpbmVFbmRcIixcbiAgICBcIkN0cmwtQmFja3NwYWNlXCI6IFwiZGVsR3JvdXBCZWZvcmVcIiwgXCJDdHJsLURlbGV0ZVwiOiBcImRlbEdyb3VwQWZ0ZXJcIiwgXCJDdHJsLVNcIjogXCJzYXZlXCIsIFwiQ3RybC1GXCI6IFwiZmluZFwiLFxuICAgIFwiQ3RybC1HXCI6IFwiZmluZE5leHRcIiwgXCJTaGlmdC1DdHJsLUdcIjogXCJmaW5kUHJldlwiLCBcIlNoaWZ0LUN0cmwtRlwiOiBcInJlcGxhY2VcIiwgXCJTaGlmdC1DdHJsLVJcIjogXCJyZXBsYWNlQWxsXCIsXG4gICAgXCJDdHJsLVtcIjogXCJpbmRlbnRMZXNzXCIsIFwiQ3RybC1dXCI6IFwiaW5kZW50TW9yZVwiLFxuICAgIFwiQ3RybC1VXCI6IFwidW5kb1NlbGVjdGlvblwiLCBcIlNoaWZ0LUN0cmwtVVwiOiBcInJlZG9TZWxlY3Rpb25cIiwgXCJBbHQtVVwiOiBcInJlZG9TZWxlY3Rpb25cIixcbiAgICBmYWxsdGhyb3VnaDogXCJiYXNpY1wiXG4gIH07XG4gIC8vIFZlcnkgYmFzaWMgcmVhZGxpbmUvZW1hY3Mtc3R5bGUgYmluZGluZ3MsIHdoaWNoIGFyZSBzdGFuZGFyZCBvbiBNYWMuXG4gIGtleU1hcC5lbWFjc3kgPSB7XG4gICAgXCJDdHJsLUZcIjogXCJnb0NoYXJSaWdodFwiLCBcIkN0cmwtQlwiOiBcImdvQ2hhckxlZnRcIiwgXCJDdHJsLVBcIjogXCJnb0xpbmVVcFwiLCBcIkN0cmwtTlwiOiBcImdvTGluZURvd25cIixcbiAgICBcIkFsdC1GXCI6IFwiZ29Xb3JkUmlnaHRcIiwgXCJBbHQtQlwiOiBcImdvV29yZExlZnRcIiwgXCJDdHJsLUFcIjogXCJnb0xpbmVTdGFydFwiLCBcIkN0cmwtRVwiOiBcImdvTGluZUVuZFwiLFxuICAgIFwiQ3RybC1WXCI6IFwiZ29QYWdlRG93blwiLCBcIlNoaWZ0LUN0cmwtVlwiOiBcImdvUGFnZVVwXCIsIFwiQ3RybC1EXCI6IFwiZGVsQ2hhckFmdGVyXCIsIFwiQ3RybC1IXCI6IFwiZGVsQ2hhckJlZm9yZVwiLFxuICAgIFwiQWx0LURcIjogXCJkZWxXb3JkQWZ0ZXJcIiwgXCJBbHQtQmFja3NwYWNlXCI6IFwiZGVsV29yZEJlZm9yZVwiLCBcIkN0cmwtS1wiOiBcImtpbGxMaW5lXCIsIFwiQ3RybC1UXCI6IFwidHJhbnNwb3NlQ2hhcnNcIlxuICB9O1xuICBrZXlNYXAubWFjRGVmYXVsdCA9IHtcbiAgICBcIkNtZC1BXCI6IFwic2VsZWN0QWxsXCIsIFwiQ21kLURcIjogXCJkZWxldGVMaW5lXCIsIFwiQ21kLVpcIjogXCJ1bmRvXCIsIFwiU2hpZnQtQ21kLVpcIjogXCJyZWRvXCIsIFwiQ21kLVlcIjogXCJyZWRvXCIsXG4gICAgXCJDbWQtSG9tZVwiOiBcImdvRG9jU3RhcnRcIiwgXCJDbWQtVXBcIjogXCJnb0RvY1N0YXJ0XCIsIFwiQ21kLUVuZFwiOiBcImdvRG9jRW5kXCIsIFwiQ21kLURvd25cIjogXCJnb0RvY0VuZFwiLCBcIkFsdC1MZWZ0XCI6IFwiZ29Hcm91cExlZnRcIixcbiAgICBcIkFsdC1SaWdodFwiOiBcImdvR3JvdXBSaWdodFwiLCBcIkNtZC1MZWZ0XCI6IFwiZ29MaW5lTGVmdFwiLCBcIkNtZC1SaWdodFwiOiBcImdvTGluZVJpZ2h0XCIsIFwiQWx0LUJhY2tzcGFjZVwiOiBcImRlbEdyb3VwQmVmb3JlXCIsXG4gICAgXCJDdHJsLUFsdC1CYWNrc3BhY2VcIjogXCJkZWxHcm91cEFmdGVyXCIsIFwiQWx0LURlbGV0ZVwiOiBcImRlbEdyb3VwQWZ0ZXJcIiwgXCJDbWQtU1wiOiBcInNhdmVcIiwgXCJDbWQtRlwiOiBcImZpbmRcIixcbiAgICBcIkNtZC1HXCI6IFwiZmluZE5leHRcIiwgXCJTaGlmdC1DbWQtR1wiOiBcImZpbmRQcmV2XCIsIFwiQ21kLUFsdC1GXCI6IFwicmVwbGFjZVwiLCBcIlNoaWZ0LUNtZC1BbHQtRlwiOiBcInJlcGxhY2VBbGxcIixcbiAgICBcIkNtZC1bXCI6IFwiaW5kZW50TGVzc1wiLCBcIkNtZC1dXCI6IFwiaW5kZW50TW9yZVwiLCBcIkNtZC1CYWNrc3BhY2VcIjogXCJkZWxXcmFwcGVkTGluZUxlZnRcIiwgXCJDbWQtRGVsZXRlXCI6IFwiZGVsV3JhcHBlZExpbmVSaWdodFwiLFxuICAgIFwiQ21kLVVcIjogXCJ1bmRvU2VsZWN0aW9uXCIsIFwiU2hpZnQtQ21kLVVcIjogXCJyZWRvU2VsZWN0aW9uXCIsIFwiQ3RybC1VcFwiOiBcImdvRG9jU3RhcnRcIiwgXCJDdHJsLURvd25cIjogXCJnb0RvY0VuZFwiLFxuICAgIGZhbGx0aHJvdWdoOiBbXCJiYXNpY1wiLCBcImVtYWNzeVwiXVxuICB9O1xuICBrZXlNYXBbXCJkZWZhdWx0XCJdID0gbWFjID8ga2V5TWFwLm1hY0RlZmF1bHQgOiBrZXlNYXAucGNEZWZhdWx0O1xuXG4gIC8vIEtFWU1BUCBESVNQQVRDSFxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZUtleU5hbWUobmFtZSkge1xuICAgIHZhciBwYXJ0cyA9IG5hbWUuc3BsaXQoLy0oPyEkKS8pLCBuYW1lID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gICAgdmFyIGFsdCwgY3RybCwgc2hpZnQsIGNtZDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgdmFyIG1vZCA9IHBhcnRzW2ldO1xuICAgICAgaWYgKC9eKGNtZHxtZXRhfG0pJC9pLnRlc3QobW9kKSkgY21kID0gdHJ1ZTtcbiAgICAgIGVsc2UgaWYgKC9eYShsdCk/JC9pLnRlc3QobW9kKSkgYWx0ID0gdHJ1ZTtcbiAgICAgIGVsc2UgaWYgKC9eKGN8Y3RybHxjb250cm9sKSQvaS50ZXN0KG1vZCkpIGN0cmwgPSB0cnVlO1xuICAgICAgZWxzZSBpZiAoL15zKGhpZnQpJC9pLnRlc3QobW9kKSkgc2hpZnQgPSB0cnVlO1xuICAgICAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbml6ZWQgbW9kaWZpZXIgbmFtZTogXCIgKyBtb2QpO1xuICAgIH1cbiAgICBpZiAoYWx0KSBuYW1lID0gXCJBbHQtXCIgKyBuYW1lO1xuICAgIGlmIChjdHJsKSBuYW1lID0gXCJDdHJsLVwiICsgbmFtZTtcbiAgICBpZiAoY21kKSBuYW1lID0gXCJDbWQtXCIgKyBuYW1lO1xuICAgIGlmIChzaGlmdCkgbmFtZSA9IFwiU2hpZnQtXCIgKyBuYW1lO1xuICAgIHJldHVybiBuYW1lO1xuICB9XG5cbiAgLy8gVGhpcyBpcyBhIGtsdWRnZSB0byBrZWVwIGtleW1hcHMgbW9zdGx5IHdvcmtpbmcgYXMgcmF3IG9iamVjdHNcbiAgLy8gKGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5KSB3aGlsZSBhdCB0aGUgc2FtZSB0aW1lIHN1cHBvcnQgZmVhdHVyZXNcbiAgLy8gbGlrZSBub3JtYWxpemF0aW9uIGFuZCBtdWx0aS1zdHJva2Uga2V5IGJpbmRpbmdzLiBJdCBjb21waWxlcyBhXG4gIC8vIG5ldyBub3JtYWxpemVkIGtleW1hcCwgYW5kIHRoZW4gdXBkYXRlcyB0aGUgb2xkIG9iamVjdCB0byByZWZsZWN0XG4gIC8vIHRoaXMuXG4gIENvZGVNaXJyb3Iubm9ybWFsaXplS2V5TWFwID0gZnVuY3Rpb24oa2V5bWFwKSB7XG4gICAgdmFyIGNvcHkgPSB7fTtcbiAgICBmb3IgKHZhciBrZXluYW1lIGluIGtleW1hcCkgaWYgKGtleW1hcC5oYXNPd25Qcm9wZXJ0eShrZXluYW1lKSkge1xuICAgICAgdmFyIHZhbHVlID0ga2V5bWFwW2tleW5hbWVdO1xuICAgICAgaWYgKC9eKG5hbWV8ZmFsbHRocm91Z2h8KGRlfGF0KXRhY2gpJC8udGVzdChrZXluYW1lKSkgY29udGludWU7XG4gICAgICBpZiAodmFsdWUgPT0gXCIuLi5cIikgeyBkZWxldGUga2V5bWFwW2tleW5hbWVdOyBjb250aW51ZTsgfVxuXG4gICAgICB2YXIga2V5cyA9IG1hcChrZXluYW1lLnNwbGl0KFwiIFwiKSwgbm9ybWFsaXplS2V5TmFtZSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHZhbCwgbmFtZTtcbiAgICAgICAgaWYgKGkgPT0ga2V5cy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgbmFtZSA9IGtleXMuam9pbihcIiBcIik7XG4gICAgICAgICAgdmFsID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbmFtZSA9IGtleXMuc2xpY2UoMCwgaSArIDEpLmpvaW4oXCIgXCIpO1xuICAgICAgICAgIHZhbCA9IFwiLi4uXCI7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHByZXYgPSBjb3B5W25hbWVdO1xuICAgICAgICBpZiAoIXByZXYpIGNvcHlbbmFtZV0gPSB2YWw7XG4gICAgICAgIGVsc2UgaWYgKHByZXYgIT0gdmFsKSB0aHJvdyBuZXcgRXJyb3IoXCJJbmNvbnNpc3RlbnQgYmluZGluZ3MgZm9yIFwiICsgbmFtZSk7XG4gICAgICB9XG4gICAgICBkZWxldGUga2V5bWFwW2tleW5hbWVdO1xuICAgIH1cbiAgICBmb3IgKHZhciBwcm9wIGluIGNvcHkpIGtleW1hcFtwcm9wXSA9IGNvcHlbcHJvcF07XG4gICAgcmV0dXJuIGtleW1hcDtcbiAgfTtcblxuICB2YXIgbG9va3VwS2V5ID0gQ29kZU1pcnJvci5sb29rdXBLZXkgPSBmdW5jdGlvbihrZXksIG1hcCwgaGFuZGxlLCBjb250ZXh0KSB7XG4gICAgbWFwID0gZ2V0S2V5TWFwKG1hcCk7XG4gICAgdmFyIGZvdW5kID0gbWFwLmNhbGwgPyBtYXAuY2FsbChrZXksIGNvbnRleHQpIDogbWFwW2tleV07XG4gICAgaWYgKGZvdW5kID09PSBmYWxzZSkgcmV0dXJuIFwibm90aGluZ1wiO1xuICAgIGlmIChmb3VuZCA9PT0gXCIuLi5cIikgcmV0dXJuIFwibXVsdGlcIjtcbiAgICBpZiAoZm91bmQgIT0gbnVsbCAmJiBoYW5kbGUoZm91bmQpKSByZXR1cm4gXCJoYW5kbGVkXCI7XG5cbiAgICBpZiAobWFwLmZhbGx0aHJvdWdoKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG1hcC5mYWxsdGhyb3VnaCkgIT0gXCJbb2JqZWN0IEFycmF5XVwiKVxuICAgICAgICByZXR1cm4gbG9va3VwS2V5KGtleSwgbWFwLmZhbGx0aHJvdWdoLCBoYW5kbGUsIGNvbnRleHQpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXAuZmFsbHRocm91Z2gubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IGxvb2t1cEtleShrZXksIG1hcC5mYWxsdGhyb3VnaFtpXSwgaGFuZGxlLCBjb250ZXh0KTtcbiAgICAgICAgaWYgKHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgLy8gTW9kaWZpZXIga2V5IHByZXNzZXMgZG9uJ3QgY291bnQgYXMgJ3JlYWwnIGtleSBwcmVzc2VzIGZvciB0aGVcbiAgLy8gcHVycG9zZSBvZiBrZXltYXAgZmFsbHRocm91Z2guXG4gIHZhciBpc01vZGlmaWVyS2V5ID0gQ29kZU1pcnJvci5pc01vZGlmaWVyS2V5ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB2YXIgbmFtZSA9IHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiID8gdmFsdWUgOiBrZXlOYW1lc1t2YWx1ZS5rZXlDb2RlXTtcbiAgICByZXR1cm4gbmFtZSA9PSBcIkN0cmxcIiB8fCBuYW1lID09IFwiQWx0XCIgfHwgbmFtZSA9PSBcIlNoaWZ0XCIgfHwgbmFtZSA9PSBcIk1vZFwiO1xuICB9O1xuXG4gIC8vIExvb2sgdXAgdGhlIG5hbWUgb2YgYSBrZXkgYXMgaW5kaWNhdGVkIGJ5IGFuIGV2ZW50IG9iamVjdC5cbiAgdmFyIGtleU5hbWUgPSBDb2RlTWlycm9yLmtleU5hbWUgPSBmdW5jdGlvbihldmVudCwgbm9TaGlmdCkge1xuICAgIGlmIChwcmVzdG8gJiYgZXZlbnQua2V5Q29kZSA9PSAzNCAmJiBldmVudFtcImNoYXJcIl0pIHJldHVybiBmYWxzZTtcbiAgICB2YXIgYmFzZSA9IGtleU5hbWVzW2V2ZW50LmtleUNvZGVdLCBuYW1lID0gYmFzZTtcbiAgICBpZiAobmFtZSA9PSBudWxsIHx8IGV2ZW50LmFsdEdyYXBoS2V5KSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKGV2ZW50LmFsdEtleSAmJiBiYXNlICE9IFwiQWx0XCIpIG5hbWUgPSBcIkFsdC1cIiArIG5hbWU7XG4gICAgaWYgKChmbGlwQ3RybENtZCA/IGV2ZW50Lm1ldGFLZXkgOiBldmVudC5jdHJsS2V5KSAmJiBiYXNlICE9IFwiQ3RybFwiKSBuYW1lID0gXCJDdHJsLVwiICsgbmFtZTtcbiAgICBpZiAoKGZsaXBDdHJsQ21kID8gZXZlbnQuY3RybEtleSA6IGV2ZW50Lm1ldGFLZXkpICYmIGJhc2UgIT0gXCJDbWRcIikgbmFtZSA9IFwiQ21kLVwiICsgbmFtZTtcbiAgICBpZiAoIW5vU2hpZnQgJiYgZXZlbnQuc2hpZnRLZXkgJiYgYmFzZSAhPSBcIlNoaWZ0XCIpIG5hbWUgPSBcIlNoaWZ0LVwiICsgbmFtZTtcbiAgICByZXR1cm4gbmFtZTtcbiAgfTtcblxuICBmdW5jdGlvbiBnZXRLZXlNYXAodmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT0gXCJzdHJpbmdcIiA/IGtleU1hcFt2YWxdIDogdmFsO1xuICB9XG5cbiAgLy8gRlJPTVRFWFRBUkVBXG5cbiAgQ29kZU1pcnJvci5mcm9tVGV4dEFyZWEgPSBmdW5jdGlvbih0ZXh0YXJlYSwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zID8gY29weU9iaihvcHRpb25zKSA6IHt9O1xuICAgIG9wdGlvbnMudmFsdWUgPSB0ZXh0YXJlYS52YWx1ZTtcbiAgICBpZiAoIW9wdGlvbnMudGFiaW5kZXggJiYgdGV4dGFyZWEudGFiSW5kZXgpXG4gICAgICBvcHRpb25zLnRhYmluZGV4ID0gdGV4dGFyZWEudGFiSW5kZXg7XG4gICAgaWYgKCFvcHRpb25zLnBsYWNlaG9sZGVyICYmIHRleHRhcmVhLnBsYWNlaG9sZGVyKVxuICAgICAgb3B0aW9ucy5wbGFjZWhvbGRlciA9IHRleHRhcmVhLnBsYWNlaG9sZGVyO1xuICAgIC8vIFNldCBhdXRvZm9jdXMgdG8gdHJ1ZSBpZiB0aGlzIHRleHRhcmVhIGlzIGZvY3VzZWQsIG9yIGlmIGl0IGhhc1xuICAgIC8vIGF1dG9mb2N1cyBhbmQgbm8gb3RoZXIgZWxlbWVudCBpcyBmb2N1c2VkLlxuICAgIGlmIChvcHRpb25zLmF1dG9mb2N1cyA9PSBudWxsKSB7XG4gICAgICB2YXIgaGFzRm9jdXMgPSBhY3RpdmVFbHQoKTtcbiAgICAgIG9wdGlvbnMuYXV0b2ZvY3VzID0gaGFzRm9jdXMgPT0gdGV4dGFyZWEgfHxcbiAgICAgICAgdGV4dGFyZWEuZ2V0QXR0cmlidXRlKFwiYXV0b2ZvY3VzXCIpICE9IG51bGwgJiYgaGFzRm9jdXMgPT0gZG9jdW1lbnQuYm9keTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzYXZlKCkge3RleHRhcmVhLnZhbHVlID0gY20uZ2V0VmFsdWUoKTt9XG4gICAgaWYgKHRleHRhcmVhLmZvcm0pIHtcbiAgICAgIG9uKHRleHRhcmVhLmZvcm0sIFwic3VibWl0XCIsIHNhdmUpO1xuICAgICAgLy8gRGVwbG9yYWJsZSBoYWNrIHRvIG1ha2UgdGhlIHN1Ym1pdCBtZXRob2QgZG8gdGhlIHJpZ2h0IHRoaW5nLlxuICAgICAgaWYgKCFvcHRpb25zLmxlYXZlU3VibWl0TWV0aG9kQWxvbmUpIHtcbiAgICAgICAgdmFyIGZvcm0gPSB0ZXh0YXJlYS5mb3JtLCByZWFsU3VibWl0ID0gZm9ybS5zdWJtaXQ7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdmFyIHdyYXBwZWRTdWJtaXQgPSBmb3JtLnN1Ym1pdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2F2ZSgpO1xuICAgICAgICAgICAgZm9ybS5zdWJtaXQgPSByZWFsU3VibWl0O1xuICAgICAgICAgICAgZm9ybS5zdWJtaXQoKTtcbiAgICAgICAgICAgIGZvcm0uc3VibWl0ID0gd3JhcHBlZFN1Ym1pdDtcbiAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoKGUpIHt9XG4gICAgICB9XG4gICAgfVxuXG4gICAgb3B0aW9ucy5maW5pc2hJbml0ID0gZnVuY3Rpb24oY20pIHtcbiAgICAgIGNtLnNhdmUgPSBzYXZlO1xuICAgICAgY20uZ2V0VGV4dEFyZWEgPSBmdW5jdGlvbigpIHsgcmV0dXJuIHRleHRhcmVhOyB9O1xuICAgICAgY20udG9UZXh0QXJlYSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBjbS50b1RleHRBcmVhID0gaXNOYU47IC8vIFByZXZlbnQgdGhpcyBmcm9tIGJlaW5nIHJhbiB0d2ljZVxuICAgICAgICBzYXZlKCk7XG4gICAgICAgIHRleHRhcmVhLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoY20uZ2V0V3JhcHBlckVsZW1lbnQoKSk7XG4gICAgICAgIHRleHRhcmVhLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgICAgICBpZiAodGV4dGFyZWEuZm9ybSkge1xuICAgICAgICAgIG9mZih0ZXh0YXJlYS5mb3JtLCBcInN1Ym1pdFwiLCBzYXZlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIHRleHRhcmVhLmZvcm0uc3VibWl0ID09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgIHRleHRhcmVhLmZvcm0uc3VibWl0ID0gcmVhbFN1Ym1pdDtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9O1xuXG4gICAgdGV4dGFyZWEuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICAgIHZhciBjbSA9IENvZGVNaXJyb3IoZnVuY3Rpb24obm9kZSkge1xuICAgICAgdGV4dGFyZWEucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZSwgdGV4dGFyZWEubmV4dFNpYmxpbmcpO1xuICAgIH0sIG9wdGlvbnMpO1xuICAgIHJldHVybiBjbTtcbiAgfTtcblxuICAvLyBTVFJJTkcgU1RSRUFNXG5cbiAgLy8gRmVkIHRvIHRoZSBtb2RlIHBhcnNlcnMsIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gbWFrZVxuICAvLyBwYXJzZXJzIG1vcmUgc3VjY2luY3QuXG5cbiAgdmFyIFN0cmluZ1N0cmVhbSA9IENvZGVNaXJyb3IuU3RyaW5nU3RyZWFtID0gZnVuY3Rpb24oc3RyaW5nLCB0YWJTaXplKSB7XG4gICAgdGhpcy5wb3MgPSB0aGlzLnN0YXJ0ID0gMDtcbiAgICB0aGlzLnN0cmluZyA9IHN0cmluZztcbiAgICB0aGlzLnRhYlNpemUgPSB0YWJTaXplIHx8IDg7XG4gICAgdGhpcy5sYXN0Q29sdW1uUG9zID0gdGhpcy5sYXN0Q29sdW1uVmFsdWUgPSAwO1xuICAgIHRoaXMubGluZVN0YXJ0ID0gMDtcbiAgfTtcblxuICBTdHJpbmdTdHJlYW0ucHJvdG90eXBlID0ge1xuICAgIGVvbDogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMucG9zID49IHRoaXMuc3RyaW5nLmxlbmd0aDt9LFxuICAgIHNvbDogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMucG9zID09IHRoaXMubGluZVN0YXJ0O30sXG4gICAgcGVlazogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuc3RyaW5nLmNoYXJBdCh0aGlzLnBvcykgfHwgdW5kZWZpbmVkO30sXG4gICAgbmV4dDogZnVuY3Rpb24oKSB7XG4gICAgICBpZiAodGhpcy5wb3MgPCB0aGlzLnN0cmluZy5sZW5ndGgpXG4gICAgICAgIHJldHVybiB0aGlzLnN0cmluZy5jaGFyQXQodGhpcy5wb3MrKyk7XG4gICAgfSxcbiAgICBlYXQ6IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICB2YXIgY2ggPSB0aGlzLnN0cmluZy5jaGFyQXQodGhpcy5wb3MpO1xuICAgICAgaWYgKHR5cGVvZiBtYXRjaCA9PSBcInN0cmluZ1wiKSB2YXIgb2sgPSBjaCA9PSBtYXRjaDtcbiAgICAgIGVsc2UgdmFyIG9rID0gY2ggJiYgKG1hdGNoLnRlc3QgPyBtYXRjaC50ZXN0KGNoKSA6IG1hdGNoKGNoKSk7XG4gICAgICBpZiAob2spIHsrK3RoaXMucG9zOyByZXR1cm4gY2g7fVxuICAgIH0sXG4gICAgZWF0V2hpbGU6IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICB2YXIgc3RhcnQgPSB0aGlzLnBvcztcbiAgICAgIHdoaWxlICh0aGlzLmVhdChtYXRjaCkpe31cbiAgICAgIHJldHVybiB0aGlzLnBvcyA+IHN0YXJ0O1xuICAgIH0sXG4gICAgZWF0U3BhY2U6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHN0YXJ0ID0gdGhpcy5wb3M7XG4gICAgICB3aGlsZSAoL1tcXHNcXHUwMGEwXS8udGVzdCh0aGlzLnN0cmluZy5jaGFyQXQodGhpcy5wb3MpKSkgKyt0aGlzLnBvcztcbiAgICAgIHJldHVybiB0aGlzLnBvcyA+IHN0YXJ0O1xuICAgIH0sXG4gICAgc2tpcFRvRW5kOiBmdW5jdGlvbigpIHt0aGlzLnBvcyA9IHRoaXMuc3RyaW5nLmxlbmd0aDt9LFxuICAgIHNraXBUbzogZnVuY3Rpb24oY2gpIHtcbiAgICAgIHZhciBmb3VuZCA9IHRoaXMuc3RyaW5nLmluZGV4T2YoY2gsIHRoaXMucG9zKTtcbiAgICAgIGlmIChmb3VuZCA+IC0xKSB7dGhpcy5wb3MgPSBmb3VuZDsgcmV0dXJuIHRydWU7fVxuICAgIH0sXG4gICAgYmFja1VwOiBmdW5jdGlvbihuKSB7dGhpcy5wb3MgLT0gbjt9LFxuICAgIGNvbHVtbjogZnVuY3Rpb24oKSB7XG4gICAgICBpZiAodGhpcy5sYXN0Q29sdW1uUG9zIDwgdGhpcy5zdGFydCkge1xuICAgICAgICB0aGlzLmxhc3RDb2x1bW5WYWx1ZSA9IGNvdW50Q29sdW1uKHRoaXMuc3RyaW5nLCB0aGlzLnN0YXJ0LCB0aGlzLnRhYlNpemUsIHRoaXMubGFzdENvbHVtblBvcywgdGhpcy5sYXN0Q29sdW1uVmFsdWUpO1xuICAgICAgICB0aGlzLmxhc3RDb2x1bW5Qb3MgPSB0aGlzLnN0YXJ0O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMubGFzdENvbHVtblZhbHVlIC0gKHRoaXMubGluZVN0YXJ0ID8gY291bnRDb2x1bW4odGhpcy5zdHJpbmcsIHRoaXMubGluZVN0YXJ0LCB0aGlzLnRhYlNpemUpIDogMCk7XG4gICAgfSxcbiAgICBpbmRlbnRhdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gY291bnRDb2x1bW4odGhpcy5zdHJpbmcsIG51bGwsIHRoaXMudGFiU2l6ZSkgLVxuICAgICAgICAodGhpcy5saW5lU3RhcnQgPyBjb3VudENvbHVtbih0aGlzLnN0cmluZywgdGhpcy5saW5lU3RhcnQsIHRoaXMudGFiU2l6ZSkgOiAwKTtcbiAgICB9LFxuICAgIG1hdGNoOiBmdW5jdGlvbihwYXR0ZXJuLCBjb25zdW1lLCBjYXNlSW5zZW5zaXRpdmUpIHtcbiAgICAgIGlmICh0eXBlb2YgcGF0dGVybiA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHZhciBjYXNlZCA9IGZ1bmN0aW9uKHN0cikge3JldHVybiBjYXNlSW5zZW5zaXRpdmUgPyBzdHIudG9Mb3dlckNhc2UoKSA6IHN0cjt9O1xuICAgICAgICB2YXIgc3Vic3RyID0gdGhpcy5zdHJpbmcuc3Vic3RyKHRoaXMucG9zLCBwYXR0ZXJuLmxlbmd0aCk7XG4gICAgICAgIGlmIChjYXNlZChzdWJzdHIpID09IGNhc2VkKHBhdHRlcm4pKSB7XG4gICAgICAgICAgaWYgKGNvbnN1bWUgIT09IGZhbHNlKSB0aGlzLnBvcyArPSBwYXR0ZXJuLmxlbmd0aDtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG1hdGNoID0gdGhpcy5zdHJpbmcuc2xpY2UodGhpcy5wb3MpLm1hdGNoKHBhdHRlcm4pO1xuICAgICAgICBpZiAobWF0Y2ggJiYgbWF0Y2guaW5kZXggPiAwKSByZXR1cm4gbnVsbDtcbiAgICAgICAgaWYgKG1hdGNoICYmIGNvbnN1bWUgIT09IGZhbHNlKSB0aGlzLnBvcyArPSBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgIH1cbiAgICB9LFxuICAgIGN1cnJlbnQ6IGZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuc3RyaW5nLnNsaWNlKHRoaXMuc3RhcnQsIHRoaXMucG9zKTt9LFxuICAgIGhpZGVGaXJzdENoYXJzOiBmdW5jdGlvbihuLCBpbm5lcikge1xuICAgICAgdGhpcy5saW5lU3RhcnQgKz0gbjtcbiAgICAgIHRyeSB7IHJldHVybiBpbm5lcigpOyB9XG4gICAgICBmaW5hbGx5IHsgdGhpcy5saW5lU3RhcnQgLT0gbjsgfVxuICAgIH1cbiAgfTtcblxuICAvLyBURVhUTUFSS0VSU1xuXG4gIC8vIENyZWF0ZWQgd2l0aCBtYXJrVGV4dCBhbmQgc2V0Qm9va21hcmsgbWV0aG9kcy4gQSBUZXh0TWFya2VyIGlzIGFcbiAgLy8gaGFuZGxlIHRoYXQgY2FuIGJlIHVzZWQgdG8gY2xlYXIgb3IgZmluZCBhIG1hcmtlZCBwb3NpdGlvbiBpbiB0aGVcbiAgLy8gZG9jdW1lbnQuIExpbmUgb2JqZWN0cyBob2xkIGFycmF5cyAobWFya2VkU3BhbnMpIGNvbnRhaW5pbmdcbiAgLy8ge2Zyb20sIHRvLCBtYXJrZXJ9IG9iamVjdCBwb2ludGluZyB0byBzdWNoIG1hcmtlciBvYmplY3RzLCBhbmRcbiAgLy8gaW5kaWNhdGluZyB0aGF0IHN1Y2ggYSBtYXJrZXIgaXMgcHJlc2VudCBvbiB0aGF0IGxpbmUuIE11bHRpcGxlXG4gIC8vIGxpbmVzIG1heSBwb2ludCB0byB0aGUgc2FtZSBtYXJrZXIgd2hlbiBpdCBzcGFucyBhY3Jvc3MgbGluZXMuXG4gIC8vIFRoZSBzcGFucyB3aWxsIGhhdmUgbnVsbCBmb3IgdGhlaXIgZnJvbS90byBwcm9wZXJ0aWVzIHdoZW4gdGhlXG4gIC8vIG1hcmtlciBjb250aW51ZXMgYmV5b25kIHRoZSBzdGFydC9lbmQgb2YgdGhlIGxpbmUuIE1hcmtlcnMgaGF2ZVxuICAvLyBsaW5rcyBiYWNrIHRvIHRoZSBsaW5lcyB0aGV5IGN1cnJlbnRseSB0b3VjaC5cblxuICB2YXIgbmV4dE1hcmtlcklkID0gMDtcblxuICB2YXIgVGV4dE1hcmtlciA9IENvZGVNaXJyb3IuVGV4dE1hcmtlciA9IGZ1bmN0aW9uKGRvYywgdHlwZSkge1xuICAgIHRoaXMubGluZXMgPSBbXTtcbiAgICB0aGlzLnR5cGUgPSB0eXBlO1xuICAgIHRoaXMuZG9jID0gZG9jO1xuICAgIHRoaXMuaWQgPSArK25leHRNYXJrZXJJZDtcbiAgfTtcbiAgZXZlbnRNaXhpbihUZXh0TWFya2VyKTtcblxuICAvLyBDbGVhciB0aGUgbWFya2VyLlxuICBUZXh0TWFya2VyLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmV4cGxpY2l0bHlDbGVhcmVkKSByZXR1cm47XG4gICAgdmFyIGNtID0gdGhpcy5kb2MuY20sIHdpdGhPcCA9IGNtICYmICFjbS5jdXJPcDtcbiAgICBpZiAod2l0aE9wKSBzdGFydE9wZXJhdGlvbihjbSk7XG4gICAgaWYgKGhhc0hhbmRsZXIodGhpcywgXCJjbGVhclwiKSkge1xuICAgICAgdmFyIGZvdW5kID0gdGhpcy5maW5kKCk7XG4gICAgICBpZiAoZm91bmQpIHNpZ25hbExhdGVyKHRoaXMsIFwiY2xlYXJcIiwgZm91bmQuZnJvbSwgZm91bmQudG8pO1xuICAgIH1cbiAgICB2YXIgbWluID0gbnVsbCwgbWF4ID0gbnVsbDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBsaW5lID0gdGhpcy5saW5lc1tpXTtcbiAgICAgIHZhciBzcGFuID0gZ2V0TWFya2VkU3BhbkZvcihsaW5lLm1hcmtlZFNwYW5zLCB0aGlzKTtcbiAgICAgIGlmIChjbSAmJiAhdGhpcy5jb2xsYXBzZWQpIHJlZ0xpbmVDaGFuZ2UoY20sIGxpbmVObyhsaW5lKSwgXCJ0ZXh0XCIpO1xuICAgICAgZWxzZSBpZiAoY20pIHtcbiAgICAgICAgaWYgKHNwYW4udG8gIT0gbnVsbCkgbWF4ID0gbGluZU5vKGxpbmUpO1xuICAgICAgICBpZiAoc3Bhbi5mcm9tICE9IG51bGwpIG1pbiA9IGxpbmVObyhsaW5lKTtcbiAgICAgIH1cbiAgICAgIGxpbmUubWFya2VkU3BhbnMgPSByZW1vdmVNYXJrZWRTcGFuKGxpbmUubWFya2VkU3BhbnMsIHNwYW4pO1xuICAgICAgaWYgKHNwYW4uZnJvbSA9PSBudWxsICYmIHRoaXMuY29sbGFwc2VkICYmICFsaW5lSXNIaWRkZW4odGhpcy5kb2MsIGxpbmUpICYmIGNtKVxuICAgICAgICB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIHRleHRIZWlnaHQoY20uZGlzcGxheSkpO1xuICAgIH1cbiAgICBpZiAoY20gJiYgdGhpcy5jb2xsYXBzZWQgJiYgIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciB2aXN1YWwgPSB2aXN1YWxMaW5lKHRoaXMubGluZXNbaV0pLCBsZW4gPSBsaW5lTGVuZ3RoKHZpc3VhbCk7XG4gICAgICBpZiAobGVuID4gY20uZGlzcGxheS5tYXhMaW5lTGVuZ3RoKSB7XG4gICAgICAgIGNtLmRpc3BsYXkubWF4TGluZSA9IHZpc3VhbDtcbiAgICAgICAgY20uZGlzcGxheS5tYXhMaW5lTGVuZ3RoID0gbGVuO1xuICAgICAgICBjbS5kaXNwbGF5Lm1heExpbmVDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWluICE9IG51bGwgJiYgY20gJiYgdGhpcy5jb2xsYXBzZWQpIHJlZ0NoYW5nZShjbSwgbWluLCBtYXggKyAxKTtcbiAgICB0aGlzLmxpbmVzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5leHBsaWNpdGx5Q2xlYXJlZCA9IHRydWU7XG4gICAgaWYgKHRoaXMuYXRvbWljICYmIHRoaXMuZG9jLmNhbnRFZGl0KSB7XG4gICAgICB0aGlzLmRvYy5jYW50RWRpdCA9IGZhbHNlO1xuICAgICAgaWYgKGNtKSByZUNoZWNrU2VsZWN0aW9uKGNtLmRvYyk7XG4gICAgfVxuICAgIGlmIChjbSkgc2lnbmFsTGF0ZXIoY20sIFwibWFya2VyQ2xlYXJlZFwiLCBjbSwgdGhpcyk7XG4gICAgaWYgKHdpdGhPcCkgZW5kT3BlcmF0aW9uKGNtKTtcbiAgICBpZiAodGhpcy5wYXJlbnQpIHRoaXMucGFyZW50LmNsZWFyKCk7XG4gIH07XG5cbiAgLy8gRmluZCB0aGUgcG9zaXRpb24gb2YgdGhlIG1hcmtlciBpbiB0aGUgZG9jdW1lbnQuIFJldHVybnMgYSB7ZnJvbSxcbiAgLy8gdG99IG9iamVjdCBieSBkZWZhdWx0LiBTaWRlIGNhbiBiZSBwYXNzZWQgdG8gZ2V0IGEgc3BlY2lmaWMgc2lkZVxuICAvLyAtLSAwIChib3RoKSwgLTEgKGxlZnQpLCBvciAxIChyaWdodCkuIFdoZW4gbGluZU9iaiBpcyB0cnVlLCB0aGVcbiAgLy8gUG9zIG9iamVjdHMgcmV0dXJuZWQgY29udGFpbiBhIGxpbmUgb2JqZWN0LCByYXRoZXIgdGhhbiBhIGxpbmVcbiAgLy8gbnVtYmVyICh1c2VkIHRvIHByZXZlbnQgbG9va2luZyB1cCB0aGUgc2FtZSBsaW5lIHR3aWNlKS5cbiAgVGV4dE1hcmtlci5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uKHNpZGUsIGxpbmVPYmopIHtcbiAgICBpZiAoc2lkZSA9PSBudWxsICYmIHRoaXMudHlwZSA9PSBcImJvb2ttYXJrXCIpIHNpZGUgPSAxO1xuICAgIHZhciBmcm9tLCB0bztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBsaW5lID0gdGhpcy5saW5lc1tpXTtcbiAgICAgIHZhciBzcGFuID0gZ2V0TWFya2VkU3BhbkZvcihsaW5lLm1hcmtlZFNwYW5zLCB0aGlzKTtcbiAgICAgIGlmIChzcGFuLmZyb20gIT0gbnVsbCkge1xuICAgICAgICBmcm9tID0gUG9zKGxpbmVPYmogPyBsaW5lIDogbGluZU5vKGxpbmUpLCBzcGFuLmZyb20pO1xuICAgICAgICBpZiAoc2lkZSA9PSAtMSkgcmV0dXJuIGZyb207XG4gICAgICB9XG4gICAgICBpZiAoc3Bhbi50byAhPSBudWxsKSB7XG4gICAgICAgIHRvID0gUG9zKGxpbmVPYmogPyBsaW5lIDogbGluZU5vKGxpbmUpLCBzcGFuLnRvKTtcbiAgICAgICAgaWYgKHNpZGUgPT0gMSkgcmV0dXJuIHRvO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZnJvbSAmJiB7ZnJvbTogZnJvbSwgdG86IHRvfTtcbiAgfTtcblxuICAvLyBTaWduYWxzIHRoYXQgdGhlIG1hcmtlcidzIHdpZGdldCBjaGFuZ2VkLCBhbmQgc3Vycm91bmRpbmcgbGF5b3V0XG4gIC8vIHNob3VsZCBiZSByZWNvbXB1dGVkLlxuICBUZXh0TWFya2VyLnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHBvcyA9IHRoaXMuZmluZCgtMSwgdHJ1ZSksIHdpZGdldCA9IHRoaXMsIGNtID0gdGhpcy5kb2MuY207XG4gICAgaWYgKCFwb3MgfHwgIWNtKSByZXR1cm47XG4gICAgcnVuSW5PcChjbSwgZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGluZSA9IHBvcy5saW5lLCBsaW5lTiA9IGxpbmVObyhwb3MubGluZSk7XG4gICAgICB2YXIgdmlldyA9IGZpbmRWaWV3Rm9yTGluZShjbSwgbGluZU4pO1xuICAgICAgaWYgKHZpZXcpIHtcbiAgICAgICAgY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZUZvcih2aWV3KTtcbiAgICAgICAgY20uY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IGNtLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGNtLmN1ck9wLnVwZGF0ZU1heExpbmUgPSB0cnVlO1xuICAgICAgaWYgKCFsaW5lSXNIaWRkZW4od2lkZ2V0LmRvYywgbGluZSkgJiYgd2lkZ2V0LmhlaWdodCAhPSBudWxsKSB7XG4gICAgICAgIHZhciBvbGRIZWlnaHQgPSB3aWRnZXQuaGVpZ2h0O1xuICAgICAgICB3aWRnZXQuaGVpZ2h0ID0gbnVsbDtcbiAgICAgICAgdmFyIGRIZWlnaHQgPSB3aWRnZXRIZWlnaHQod2lkZ2V0KSAtIG9sZEhlaWdodDtcbiAgICAgICAgaWYgKGRIZWlnaHQpXG4gICAgICAgICAgdXBkYXRlTGluZUhlaWdodChsaW5lLCBsaW5lLmhlaWdodCArIGRIZWlnaHQpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuXG4gIFRleHRNYXJrZXIucHJvdG90eXBlLmF0dGFjaExpbmUgPSBmdW5jdGlvbihsaW5lKSB7XG4gICAgaWYgKCF0aGlzLmxpbmVzLmxlbmd0aCAmJiB0aGlzLmRvYy5jbSkge1xuICAgICAgdmFyIG9wID0gdGhpcy5kb2MuY20uY3VyT3A7XG4gICAgICBpZiAoIW9wLm1heWJlSGlkZGVuTWFya2VycyB8fCBpbmRleE9mKG9wLm1heWJlSGlkZGVuTWFya2VycywgdGhpcykgPT0gLTEpXG4gICAgICAgIChvcC5tYXliZVVuaGlkZGVuTWFya2VycyB8fCAob3AubWF5YmVVbmhpZGRlbk1hcmtlcnMgPSBbXSkpLnB1c2godGhpcyk7XG4gICAgfVxuICAgIHRoaXMubGluZXMucHVzaChsaW5lKTtcbiAgfTtcbiAgVGV4dE1hcmtlci5wcm90b3R5cGUuZGV0YWNoTGluZSA9IGZ1bmN0aW9uKGxpbmUpIHtcbiAgICB0aGlzLmxpbmVzLnNwbGljZShpbmRleE9mKHRoaXMubGluZXMsIGxpbmUpLCAxKTtcbiAgICBpZiAoIXRoaXMubGluZXMubGVuZ3RoICYmIHRoaXMuZG9jLmNtKSB7XG4gICAgICB2YXIgb3AgPSB0aGlzLmRvYy5jbS5jdXJPcDtcbiAgICAgIChvcC5tYXliZUhpZGRlbk1hcmtlcnMgfHwgKG9wLm1heWJlSGlkZGVuTWFya2VycyA9IFtdKSkucHVzaCh0aGlzKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gQ29sbGFwc2VkIG1hcmtlcnMgaGF2ZSB1bmlxdWUgaWRzLCBpbiBvcmRlciB0byBiZSBhYmxlIHRvIG9yZGVyXG4gIC8vIHRoZW0sIHdoaWNoIGlzIG5lZWRlZCBmb3IgdW5pcXVlbHkgZGV0ZXJtaW5pbmcgYW4gb3V0ZXIgbWFya2VyXG4gIC8vIHdoZW4gdGhleSBvdmVybGFwICh0aGV5IG1heSBuZXN0LCBidXQgbm90IHBhcnRpYWxseSBvdmVybGFwKS5cbiAgdmFyIG5leHRNYXJrZXJJZCA9IDA7XG5cbiAgLy8gQ3JlYXRlIGEgbWFya2VyLCB3aXJlIGl0IHVwIHRvIHRoZSByaWdodCBsaW5lcywgYW5kXG4gIGZ1bmN0aW9uIG1hcmtUZXh0KGRvYywgZnJvbSwgdG8sIG9wdGlvbnMsIHR5cGUpIHtcbiAgICAvLyBTaGFyZWQgbWFya2VycyAoYWNyb3NzIGxpbmtlZCBkb2N1bWVudHMpIGFyZSBoYW5kbGVkIHNlcGFyYXRlbHlcbiAgICAvLyAobWFya1RleHRTaGFyZWQgd2lsbCBjYWxsIG91dCB0byB0aGlzIGFnYWluLCBvbmNlIHBlclxuICAgIC8vIGRvY3VtZW50KS5cbiAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnNoYXJlZCkgcmV0dXJuIG1hcmtUZXh0U2hhcmVkKGRvYywgZnJvbSwgdG8sIG9wdGlvbnMsIHR5cGUpO1xuICAgIC8vIEVuc3VyZSB3ZSBhcmUgaW4gYW4gb3BlcmF0aW9uLlxuICAgIGlmIChkb2MuY20gJiYgIWRvYy5jbS5jdXJPcCkgcmV0dXJuIG9wZXJhdGlvbihkb2MuY20sIG1hcmtUZXh0KShkb2MsIGZyb20sIHRvLCBvcHRpb25zLCB0eXBlKTtcblxuICAgIHZhciBtYXJrZXIgPSBuZXcgVGV4dE1hcmtlcihkb2MsIHR5cGUpLCBkaWZmID0gY21wKGZyb20sIHRvKTtcbiAgICBpZiAob3B0aW9ucykgY29weU9iaihvcHRpb25zLCBtYXJrZXIsIGZhbHNlKTtcbiAgICAvLyBEb24ndCBjb25uZWN0IGVtcHR5IG1hcmtlcnMgdW5sZXNzIGNsZWFyV2hlbkVtcHR5IGlzIGZhbHNlXG4gICAgaWYgKGRpZmYgPiAwIHx8IGRpZmYgPT0gMCAmJiBtYXJrZXIuY2xlYXJXaGVuRW1wdHkgIT09IGZhbHNlKVxuICAgICAgcmV0dXJuIG1hcmtlcjtcbiAgICBpZiAobWFya2VyLnJlcGxhY2VkV2l0aCkge1xuICAgICAgLy8gU2hvd2luZyB1cCBhcyBhIHdpZGdldCBpbXBsaWVzIGNvbGxhcHNlZCAod2lkZ2V0IHJlcGxhY2VzIHRleHQpXG4gICAgICBtYXJrZXIuY29sbGFwc2VkID0gdHJ1ZTtcbiAgICAgIG1hcmtlci53aWRnZXROb2RlID0gZWx0KFwic3BhblwiLCBbbWFya2VyLnJlcGxhY2VkV2l0aF0sIFwiQ29kZU1pcnJvci13aWRnZXRcIik7XG4gICAgICBpZiAoIW9wdGlvbnMuaGFuZGxlTW91c2VFdmVudHMpIG1hcmtlci53aWRnZXROb2RlLnNldEF0dHJpYnV0ZShcImNtLWlnbm9yZS1ldmVudHNcIiwgXCJ0cnVlXCIpO1xuICAgICAgaWYgKG9wdGlvbnMuaW5zZXJ0TGVmdCkgbWFya2VyLndpZGdldE5vZGUuaW5zZXJ0TGVmdCA9IHRydWU7XG4gICAgfVxuICAgIGlmIChtYXJrZXIuY29sbGFwc2VkKSB7XG4gICAgICBpZiAoY29uZmxpY3RpbmdDb2xsYXBzZWRSYW5nZShkb2MsIGZyb20ubGluZSwgZnJvbSwgdG8sIG1hcmtlcikgfHxcbiAgICAgICAgICBmcm9tLmxpbmUgIT0gdG8ubGluZSAmJiBjb25mbGljdGluZ0NvbGxhcHNlZFJhbmdlKGRvYywgdG8ubGluZSwgZnJvbSwgdG8sIG1hcmtlcikpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkluc2VydGluZyBjb2xsYXBzZWQgbWFya2VyIHBhcnRpYWxseSBvdmVybGFwcGluZyBhbiBleGlzdGluZyBvbmVcIik7XG4gICAgICBzYXdDb2xsYXBzZWRTcGFucyA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKG1hcmtlci5hZGRUb0hpc3RvcnkpXG4gICAgICBhZGRDaGFuZ2VUb0hpc3RvcnkoZG9jLCB7ZnJvbTogZnJvbSwgdG86IHRvLCBvcmlnaW46IFwibWFya1RleHRcIn0sIGRvYy5zZWwsIE5hTik7XG5cbiAgICB2YXIgY3VyTGluZSA9IGZyb20ubGluZSwgY20gPSBkb2MuY20sIHVwZGF0ZU1heExpbmU7XG4gICAgZG9jLml0ZXIoY3VyTGluZSwgdG8ubGluZSArIDEsIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIGlmIChjbSAmJiBtYXJrZXIuY29sbGFwc2VkICYmICFjbS5vcHRpb25zLmxpbmVXcmFwcGluZyAmJiB2aXN1YWxMaW5lKGxpbmUpID09IGNtLmRpc3BsYXkubWF4TGluZSlcbiAgICAgICAgdXBkYXRlTWF4TGluZSA9IHRydWU7XG4gICAgICBpZiAobWFya2VyLmNvbGxhcHNlZCAmJiBjdXJMaW5lICE9IGZyb20ubGluZSkgdXBkYXRlTGluZUhlaWdodChsaW5lLCAwKTtcbiAgICAgIGFkZE1hcmtlZFNwYW4obGluZSwgbmV3IE1hcmtlZFNwYW4obWFya2VyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJMaW5lID09IGZyb20ubGluZSA/IGZyb20uY2ggOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJMaW5lID09IHRvLmxpbmUgPyB0by5jaCA6IG51bGwpKTtcbiAgICAgICsrY3VyTGluZTtcbiAgICB9KTtcbiAgICAvLyBsaW5lSXNIaWRkZW4gZGVwZW5kcyBvbiB0aGUgcHJlc2VuY2Ugb2YgdGhlIHNwYW5zLCBzbyBuZWVkcyBhIHNlY29uZCBwYXNzXG4gICAgaWYgKG1hcmtlci5jb2xsYXBzZWQpIGRvYy5pdGVyKGZyb20ubGluZSwgdG8ubGluZSArIDEsIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIGlmIChsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKSkgdXBkYXRlTGluZUhlaWdodChsaW5lLCAwKTtcbiAgICB9KTtcblxuICAgIGlmIChtYXJrZXIuY2xlYXJPbkVudGVyKSBvbihtYXJrZXIsIFwiYmVmb3JlQ3Vyc29yRW50ZXJcIiwgZnVuY3Rpb24oKSB7IG1hcmtlci5jbGVhcigpOyB9KTtcblxuICAgIGlmIChtYXJrZXIucmVhZE9ubHkpIHtcbiAgICAgIHNhd1JlYWRPbmx5U3BhbnMgPSB0cnVlO1xuICAgICAgaWYgKGRvYy5oaXN0b3J5LmRvbmUubGVuZ3RoIHx8IGRvYy5oaXN0b3J5LnVuZG9uZS5sZW5ndGgpXG4gICAgICAgIGRvYy5jbGVhckhpc3RvcnkoKTtcbiAgICB9XG4gICAgaWYgKG1hcmtlci5jb2xsYXBzZWQpIHtcbiAgICAgIG1hcmtlci5pZCA9ICsrbmV4dE1hcmtlcklkO1xuICAgICAgbWFya2VyLmF0b21pYyA9IHRydWU7XG4gICAgfVxuICAgIGlmIChjbSkge1xuICAgICAgLy8gU3luYyBlZGl0b3Igc3RhdGVcbiAgICAgIGlmICh1cGRhdGVNYXhMaW5lKSBjbS5jdXJPcC51cGRhdGVNYXhMaW5lID0gdHJ1ZTtcbiAgICAgIGlmIChtYXJrZXIuY29sbGFwc2VkKVxuICAgICAgICByZWdDaGFuZ2UoY20sIGZyb20ubGluZSwgdG8ubGluZSArIDEpO1xuICAgICAgZWxzZSBpZiAobWFya2VyLmNsYXNzTmFtZSB8fCBtYXJrZXIudGl0bGUgfHwgbWFya2VyLnN0YXJ0U3R5bGUgfHwgbWFya2VyLmVuZFN0eWxlIHx8IG1hcmtlci5jc3MpXG4gICAgICAgIGZvciAodmFyIGkgPSBmcm9tLmxpbmU7IGkgPD0gdG8ubGluZTsgaSsrKSByZWdMaW5lQ2hhbmdlKGNtLCBpLCBcInRleHRcIik7XG4gICAgICBpZiAobWFya2VyLmF0b21pYykgcmVDaGVja1NlbGVjdGlvbihjbS5kb2MpO1xuICAgICAgc2lnbmFsTGF0ZXIoY20sIFwibWFya2VyQWRkZWRcIiwgY20sIG1hcmtlcik7XG4gICAgfVxuICAgIHJldHVybiBtYXJrZXI7XG4gIH1cblxuICAvLyBTSEFSRUQgVEVYVE1BUktFUlNcblxuICAvLyBBIHNoYXJlZCBtYXJrZXIgc3BhbnMgbXVsdGlwbGUgbGlua2VkIGRvY3VtZW50cy4gSXQgaXNcbiAgLy8gaW1wbGVtZW50ZWQgYXMgYSBtZXRhLW1hcmtlci1vYmplY3QgY29udHJvbGxpbmcgbXVsdGlwbGUgbm9ybWFsXG4gIC8vIG1hcmtlcnMuXG4gIHZhciBTaGFyZWRUZXh0TWFya2VyID0gQ29kZU1pcnJvci5TaGFyZWRUZXh0TWFya2VyID0gZnVuY3Rpb24obWFya2VycywgcHJpbWFyeSkge1xuICAgIHRoaXMubWFya2VycyA9IG1hcmtlcnM7XG4gICAgdGhpcy5wcmltYXJ5ID0gcHJpbWFyeTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcmtlcnMubGVuZ3RoOyArK2kpXG4gICAgICBtYXJrZXJzW2ldLnBhcmVudCA9IHRoaXM7XG4gIH07XG4gIGV2ZW50TWl4aW4oU2hhcmVkVGV4dE1hcmtlcik7XG5cbiAgU2hhcmVkVGV4dE1hcmtlci5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5leHBsaWNpdGx5Q2xlYXJlZCkgcmV0dXJuO1xuICAgIHRoaXMuZXhwbGljaXRseUNsZWFyZWQgPSB0cnVlO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tYXJrZXJzLmxlbmd0aDsgKytpKVxuICAgICAgdGhpcy5tYXJrZXJzW2ldLmNsZWFyKCk7XG4gICAgc2lnbmFsTGF0ZXIodGhpcywgXCJjbGVhclwiKTtcbiAgfTtcbiAgU2hhcmVkVGV4dE1hcmtlci5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uKHNpZGUsIGxpbmVPYmopIHtcbiAgICByZXR1cm4gdGhpcy5wcmltYXJ5LmZpbmQoc2lkZSwgbGluZU9iaik7XG4gIH07XG5cbiAgZnVuY3Rpb24gbWFya1RleHRTaGFyZWQoZG9jLCBmcm9tLCB0bywgb3B0aW9ucywgdHlwZSkge1xuICAgIG9wdGlvbnMgPSBjb3B5T2JqKG9wdGlvbnMpO1xuICAgIG9wdGlvbnMuc2hhcmVkID0gZmFsc2U7XG4gICAgdmFyIG1hcmtlcnMgPSBbbWFya1RleHQoZG9jLCBmcm9tLCB0bywgb3B0aW9ucywgdHlwZSldLCBwcmltYXJ5ID0gbWFya2Vyc1swXTtcbiAgICB2YXIgd2lkZ2V0ID0gb3B0aW9ucy53aWRnZXROb2RlO1xuICAgIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbihkb2MpIHtcbiAgICAgIGlmICh3aWRnZXQpIG9wdGlvbnMud2lkZ2V0Tm9kZSA9IHdpZGdldC5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICBtYXJrZXJzLnB1c2gobWFya1RleHQoZG9jLCBjbGlwUG9zKGRvYywgZnJvbSksIGNsaXBQb3MoZG9jLCB0byksIG9wdGlvbnMsIHR5cGUpKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLmxpbmtlZC5sZW5ndGg7ICsraSlcbiAgICAgICAgaWYgKGRvYy5saW5rZWRbaV0uaXNQYXJlbnQpIHJldHVybjtcbiAgICAgIHByaW1hcnkgPSBsc3QobWFya2Vycyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIG5ldyBTaGFyZWRUZXh0TWFya2VyKG1hcmtlcnMsIHByaW1hcnkpO1xuICB9XG5cbiAgZnVuY3Rpb24gZmluZFNoYXJlZE1hcmtlcnMoZG9jKSB7XG4gICAgcmV0dXJuIGRvYy5maW5kTWFya3MoUG9zKGRvYy5maXJzdCwgMCksIGRvYy5jbGlwUG9zKFBvcyhkb2MubGFzdExpbmUoKSkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKG0pIHsgcmV0dXJuIG0ucGFyZW50OyB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvcHlTaGFyZWRNYXJrZXJzKGRvYywgbWFya2Vycykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG1hcmtlciA9IG1hcmtlcnNbaV0sIHBvcyA9IG1hcmtlci5maW5kKCk7XG4gICAgICB2YXIgbUZyb20gPSBkb2MuY2xpcFBvcyhwb3MuZnJvbSksIG1UbyA9IGRvYy5jbGlwUG9zKHBvcy50byk7XG4gICAgICBpZiAoY21wKG1Gcm9tLCBtVG8pKSB7XG4gICAgICAgIHZhciBzdWJNYXJrID0gbWFya1RleHQoZG9jLCBtRnJvbSwgbVRvLCBtYXJrZXIucHJpbWFyeSwgbWFya2VyLnByaW1hcnkudHlwZSk7XG4gICAgICAgIG1hcmtlci5tYXJrZXJzLnB1c2goc3ViTWFyayk7XG4gICAgICAgIHN1Yk1hcmsucGFyZW50ID0gbWFya2VyO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRldGFjaFNoYXJlZE1hcmtlcnMobWFya2Vycykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIG1hcmtlciA9IG1hcmtlcnNbaV0sIGxpbmtlZCA9IFttYXJrZXIucHJpbWFyeS5kb2NdOztcbiAgICAgIGxpbmtlZERvY3MobWFya2VyLnByaW1hcnkuZG9jLCBmdW5jdGlvbihkKSB7IGxpbmtlZC5wdXNoKGQpOyB9KTtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbWFya2VyLm1hcmtlcnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgdmFyIHN1Yk1hcmtlciA9IG1hcmtlci5tYXJrZXJzW2pdO1xuICAgICAgICBpZiAoaW5kZXhPZihsaW5rZWQsIHN1Yk1hcmtlci5kb2MpID09IC0xKSB7XG4gICAgICAgICAgc3ViTWFya2VyLnBhcmVudCA9IG51bGw7XG4gICAgICAgICAgbWFya2VyLm1hcmtlcnMuc3BsaWNlKGotLSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBURVhUTUFSS0VSIFNQQU5TXG5cbiAgZnVuY3Rpb24gTWFya2VkU3BhbihtYXJrZXIsIGZyb20sIHRvKSB7XG4gICAgdGhpcy5tYXJrZXIgPSBtYXJrZXI7XG4gICAgdGhpcy5mcm9tID0gZnJvbTsgdGhpcy50byA9IHRvO1xuICB9XG5cbiAgLy8gU2VhcmNoIGFuIGFycmF5IG9mIHNwYW5zIGZvciBhIHNwYW4gbWF0Y2hpbmcgdGhlIGdpdmVuIG1hcmtlci5cbiAgZnVuY3Rpb24gZ2V0TWFya2VkU3BhbkZvcihzcGFucywgbWFya2VyKSB7XG4gICAgaWYgKHNwYW5zKSBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3BhbiA9IHNwYW5zW2ldO1xuICAgICAgaWYgKHNwYW4ubWFya2VyID09IG1hcmtlcikgcmV0dXJuIHNwYW47XG4gICAgfVxuICB9XG4gIC8vIFJlbW92ZSBhIHNwYW4gZnJvbSBhbiBhcnJheSwgcmV0dXJuaW5nIHVuZGVmaW5lZCBpZiBubyBzcGFucyBhcmVcbiAgLy8gbGVmdCAod2UgZG9uJ3Qgc3RvcmUgYXJyYXlzIGZvciBsaW5lcyB3aXRob3V0IHNwYW5zKS5cbiAgZnVuY3Rpb24gcmVtb3ZlTWFya2VkU3BhbihzcGFucywgc3Bhbikge1xuICAgIGZvciAodmFyIHIsIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpXG4gICAgICBpZiAoc3BhbnNbaV0gIT0gc3BhbikgKHIgfHwgKHIgPSBbXSkpLnB1c2goc3BhbnNbaV0pO1xuICAgIHJldHVybiByO1xuICB9XG4gIC8vIEFkZCBhIHNwYW4gdG8gYSBsaW5lLlxuICBmdW5jdGlvbiBhZGRNYXJrZWRTcGFuKGxpbmUsIHNwYW4pIHtcbiAgICBsaW5lLm1hcmtlZFNwYW5zID0gbGluZS5tYXJrZWRTcGFucyA/IGxpbmUubWFya2VkU3BhbnMuY29uY2F0KFtzcGFuXSkgOiBbc3Bhbl07XG4gICAgc3Bhbi5tYXJrZXIuYXR0YWNoTGluZShsaW5lKTtcbiAgfVxuXG4gIC8vIFVzZWQgZm9yIHRoZSBhbGdvcml0aG0gdGhhdCBhZGp1c3RzIG1hcmtlcnMgZm9yIGEgY2hhbmdlIGluIHRoZVxuICAvLyBkb2N1bWVudC4gVGhlc2UgZnVuY3Rpb25zIGN1dCBhbiBhcnJheSBvZiBzcGFucyBhdCBhIGdpdmVuXG4gIC8vIGNoYXJhY3RlciBwb3NpdGlvbiwgcmV0dXJuaW5nIGFuIGFycmF5IG9mIHJlbWFpbmluZyBjaHVua3MgKG9yXG4gIC8vIHVuZGVmaW5lZCBpZiBub3RoaW5nIHJlbWFpbnMpLlxuICBmdW5jdGlvbiBtYXJrZWRTcGFuc0JlZm9yZShvbGQsIHN0YXJ0Q2gsIGlzSW5zZXJ0KSB7XG4gICAgaWYgKG9sZCkgZm9yICh2YXIgaSA9IDAsIG53OyBpIDwgb2xkLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3BhbiA9IG9sZFtpXSwgbWFya2VyID0gc3Bhbi5tYXJrZXI7XG4gICAgICB2YXIgc3RhcnRzQmVmb3JlID0gc3Bhbi5mcm9tID09IG51bGwgfHwgKG1hcmtlci5pbmNsdXNpdmVMZWZ0ID8gc3Bhbi5mcm9tIDw9IHN0YXJ0Q2ggOiBzcGFuLmZyb20gPCBzdGFydENoKTtcbiAgICAgIGlmIChzdGFydHNCZWZvcmUgfHwgc3Bhbi5mcm9tID09IHN0YXJ0Q2ggJiYgbWFya2VyLnR5cGUgPT0gXCJib29rbWFya1wiICYmICghaXNJbnNlcnQgfHwgIXNwYW4ubWFya2VyLmluc2VydExlZnQpKSB7XG4gICAgICAgIHZhciBlbmRzQWZ0ZXIgPSBzcGFuLnRvID09IG51bGwgfHwgKG1hcmtlci5pbmNsdXNpdmVSaWdodCA/IHNwYW4udG8gPj0gc3RhcnRDaCA6IHNwYW4udG8gPiBzdGFydENoKTtcbiAgICAgICAgKG53IHx8IChudyA9IFtdKSkucHVzaChuZXcgTWFya2VkU3BhbihtYXJrZXIsIHNwYW4uZnJvbSwgZW5kc0FmdGVyID8gbnVsbCA6IHNwYW4udG8pKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG53O1xuICB9XG4gIGZ1bmN0aW9uIG1hcmtlZFNwYW5zQWZ0ZXIob2xkLCBlbmRDaCwgaXNJbnNlcnQpIHtcbiAgICBpZiAob2xkKSBmb3IgKHZhciBpID0gMCwgbnc7IGkgPCBvbGQubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBzcGFuID0gb2xkW2ldLCBtYXJrZXIgPSBzcGFuLm1hcmtlcjtcbiAgICAgIHZhciBlbmRzQWZ0ZXIgPSBzcGFuLnRvID09IG51bGwgfHwgKG1hcmtlci5pbmNsdXNpdmVSaWdodCA/IHNwYW4udG8gPj0gZW5kQ2ggOiBzcGFuLnRvID4gZW5kQ2gpO1xuICAgICAgaWYgKGVuZHNBZnRlciB8fCBzcGFuLmZyb20gPT0gZW5kQ2ggJiYgbWFya2VyLnR5cGUgPT0gXCJib29rbWFya1wiICYmICghaXNJbnNlcnQgfHwgc3Bhbi5tYXJrZXIuaW5zZXJ0TGVmdCkpIHtcbiAgICAgICAgdmFyIHN0YXJ0c0JlZm9yZSA9IHNwYW4uZnJvbSA9PSBudWxsIHx8IChtYXJrZXIuaW5jbHVzaXZlTGVmdCA/IHNwYW4uZnJvbSA8PSBlbmRDaCA6IHNwYW4uZnJvbSA8IGVuZENoKTtcbiAgICAgICAgKG53IHx8IChudyA9IFtdKSkucHVzaChuZXcgTWFya2VkU3BhbihtYXJrZXIsIHN0YXJ0c0JlZm9yZSA/IG51bGwgOiBzcGFuLmZyb20gLSBlbmRDaCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGFuLnRvID09IG51bGwgPyBudWxsIDogc3Bhbi50byAtIGVuZENoKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudztcbiAgfVxuXG4gIC8vIEdpdmVuIGEgY2hhbmdlIG9iamVjdCwgY29tcHV0ZSB0aGUgbmV3IHNldCBvZiBtYXJrZXIgc3BhbnMgdGhhdFxuICAvLyBjb3ZlciB0aGUgbGluZSBpbiB3aGljaCB0aGUgY2hhbmdlIHRvb2sgcGxhY2UuIFJlbW92ZXMgc3BhbnNcbiAgLy8gZW50aXJlbHkgd2l0aGluIHRoZSBjaGFuZ2UsIHJlY29ubmVjdHMgc3BhbnMgYmVsb25naW5nIHRvIHRoZVxuICAvLyBzYW1lIG1hcmtlciB0aGF0IGFwcGVhciBvbiBib3RoIHNpZGVzIG9mIHRoZSBjaGFuZ2UsIGFuZCBjdXRzIG9mZlxuICAvLyBzcGFucyBwYXJ0aWFsbHkgd2l0aGluIHRoZSBjaGFuZ2UuIFJldHVybnMgYW4gYXJyYXkgb2Ygc3BhblxuICAvLyBhcnJheXMgd2l0aCBvbmUgZWxlbWVudCBmb3IgZWFjaCBsaW5lIGluIChhZnRlcikgdGhlIGNoYW5nZS5cbiAgZnVuY3Rpb24gc3RyZXRjaFNwYW5zT3ZlckNoYW5nZShkb2MsIGNoYW5nZSkge1xuICAgIGlmIChjaGFuZ2UuZnVsbCkgcmV0dXJuIG51bGw7XG4gICAgdmFyIG9sZEZpcnN0ID0gaXNMaW5lKGRvYywgY2hhbmdlLmZyb20ubGluZSkgJiYgZ2V0TGluZShkb2MsIGNoYW5nZS5mcm9tLmxpbmUpLm1hcmtlZFNwYW5zO1xuICAgIHZhciBvbGRMYXN0ID0gaXNMaW5lKGRvYywgY2hhbmdlLnRvLmxpbmUpICYmIGdldExpbmUoZG9jLCBjaGFuZ2UudG8ubGluZSkubWFya2VkU3BhbnM7XG4gICAgaWYgKCFvbGRGaXJzdCAmJiAhb2xkTGFzdCkgcmV0dXJuIG51bGw7XG5cbiAgICB2YXIgc3RhcnRDaCA9IGNoYW5nZS5mcm9tLmNoLCBlbmRDaCA9IGNoYW5nZS50by5jaCwgaXNJbnNlcnQgPSBjbXAoY2hhbmdlLmZyb20sIGNoYW5nZS50bykgPT0gMDtcbiAgICAvLyBHZXQgdGhlIHNwYW5zIHRoYXQgJ3N0aWNrIG91dCcgb24gYm90aCBzaWRlc1xuICAgIHZhciBmaXJzdCA9IG1hcmtlZFNwYW5zQmVmb3JlKG9sZEZpcnN0LCBzdGFydENoLCBpc0luc2VydCk7XG4gICAgdmFyIGxhc3QgPSBtYXJrZWRTcGFuc0FmdGVyKG9sZExhc3QsIGVuZENoLCBpc0luc2VydCk7XG5cbiAgICAvLyBOZXh0LCBtZXJnZSB0aG9zZSB0d28gZW5kc1xuICAgIHZhciBzYW1lTGluZSA9IGNoYW5nZS50ZXh0Lmxlbmd0aCA9PSAxLCBvZmZzZXQgPSBsc3QoY2hhbmdlLnRleHQpLmxlbmd0aCArIChzYW1lTGluZSA/IHN0YXJ0Q2ggOiAwKTtcbiAgICBpZiAoZmlyc3QpIHtcbiAgICAgIC8vIEZpeCB1cCAudG8gcHJvcGVydGllcyBvZiBmaXJzdFxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmaXJzdC5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgc3BhbiA9IGZpcnN0W2ldO1xuICAgICAgICBpZiAoc3Bhbi50byA9PSBudWxsKSB7XG4gICAgICAgICAgdmFyIGZvdW5kID0gZ2V0TWFya2VkU3BhbkZvcihsYXN0LCBzcGFuLm1hcmtlcik7XG4gICAgICAgICAgaWYgKCFmb3VuZCkgc3Bhbi50byA9IHN0YXJ0Q2g7XG4gICAgICAgICAgZWxzZSBpZiAoc2FtZUxpbmUpIHNwYW4udG8gPSBmb3VuZC50byA9PSBudWxsID8gbnVsbCA6IGZvdW5kLnRvICsgb2Zmc2V0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChsYXN0KSB7XG4gICAgICAvLyBGaXggdXAgLmZyb20gaW4gbGFzdCAob3IgbW92ZSB0aGVtIGludG8gZmlyc3QgaW4gY2FzZSBvZiBzYW1lTGluZSlcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGFzdC5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgc3BhbiA9IGxhc3RbaV07XG4gICAgICAgIGlmIChzcGFuLnRvICE9IG51bGwpIHNwYW4udG8gKz0gb2Zmc2V0O1xuICAgICAgICBpZiAoc3Bhbi5mcm9tID09IG51bGwpIHtcbiAgICAgICAgICB2YXIgZm91bmQgPSBnZXRNYXJrZWRTcGFuRm9yKGZpcnN0LCBzcGFuLm1hcmtlcik7XG4gICAgICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICAgICAgc3Bhbi5mcm9tID0gb2Zmc2V0O1xuICAgICAgICAgICAgaWYgKHNhbWVMaW5lKSAoZmlyc3QgfHwgKGZpcnN0ID0gW10pKS5wdXNoKHNwYW4pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzcGFuLmZyb20gKz0gb2Zmc2V0O1xuICAgICAgICAgIGlmIChzYW1lTGluZSkgKGZpcnN0IHx8IChmaXJzdCA9IFtdKSkucHVzaChzcGFuKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyBNYWtlIHN1cmUgd2UgZGlkbid0IGNyZWF0ZSBhbnkgemVyby1sZW5ndGggc3BhbnNcbiAgICBpZiAoZmlyc3QpIGZpcnN0ID0gY2xlYXJFbXB0eVNwYW5zKGZpcnN0KTtcbiAgICBpZiAobGFzdCAmJiBsYXN0ICE9IGZpcnN0KSBsYXN0ID0gY2xlYXJFbXB0eVNwYW5zKGxhc3QpO1xuXG4gICAgdmFyIG5ld01hcmtlcnMgPSBbZmlyc3RdO1xuICAgIGlmICghc2FtZUxpbmUpIHtcbiAgICAgIC8vIEZpbGwgZ2FwIHdpdGggd2hvbGUtbGluZS1zcGFuc1xuICAgICAgdmFyIGdhcCA9IGNoYW5nZS50ZXh0Lmxlbmd0aCAtIDIsIGdhcE1hcmtlcnM7XG4gICAgICBpZiAoZ2FwID4gMCAmJiBmaXJzdClcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmaXJzdC5sZW5ndGg7ICsraSlcbiAgICAgICAgICBpZiAoZmlyc3RbaV0udG8gPT0gbnVsbClcbiAgICAgICAgICAgIChnYXBNYXJrZXJzIHx8IChnYXBNYXJrZXJzID0gW10pKS5wdXNoKG5ldyBNYXJrZWRTcGFuKGZpcnN0W2ldLm1hcmtlciwgbnVsbCwgbnVsbCkpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnYXA7ICsraSlcbiAgICAgICAgbmV3TWFya2Vycy5wdXNoKGdhcE1hcmtlcnMpO1xuICAgICAgbmV3TWFya2Vycy5wdXNoKGxhc3QpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3TWFya2VycztcbiAgfVxuXG4gIC8vIFJlbW92ZSBzcGFucyB0aGF0IGFyZSBlbXB0eSBhbmQgZG9uJ3QgaGF2ZSBhIGNsZWFyV2hlbkVtcHR5XG4gIC8vIG9wdGlvbiBvZiBmYWxzZS5cbiAgZnVuY3Rpb24gY2xlYXJFbXB0eVNwYW5zKHNwYW5zKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHNwYW4gPSBzcGFuc1tpXTtcbiAgICAgIGlmIChzcGFuLmZyb20gIT0gbnVsbCAmJiBzcGFuLmZyb20gPT0gc3Bhbi50byAmJiBzcGFuLm1hcmtlci5jbGVhcldoZW5FbXB0eSAhPT0gZmFsc2UpXG4gICAgICAgIHNwYW5zLnNwbGljZShpLS0sIDEpO1xuICAgIH1cbiAgICBpZiAoIXNwYW5zLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHNwYW5zO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdW4vcmUtZG9pbmcgY2hhbmdlcyBmcm9tIHRoZSBoaXN0b3J5LiBDb21iaW5lcyB0aGVcbiAgLy8gcmVzdWx0IG9mIGNvbXB1dGluZyB0aGUgZXhpc3Rpbmcgc3BhbnMgd2l0aCB0aGUgc2V0IG9mIHNwYW5zIHRoYXRcbiAgLy8gZXhpc3RlZCBpbiB0aGUgaGlzdG9yeSAoc28gdGhhdCBkZWxldGluZyBhcm91bmQgYSBzcGFuIGFuZCB0aGVuXG4gIC8vIHVuZG9pbmcgYnJpbmdzIGJhY2sgdGhlIHNwYW4pLlxuICBmdW5jdGlvbiBtZXJnZU9sZFNwYW5zKGRvYywgY2hhbmdlKSB7XG4gICAgdmFyIG9sZCA9IGdldE9sZFNwYW5zKGRvYywgY2hhbmdlKTtcbiAgICB2YXIgc3RyZXRjaGVkID0gc3RyZXRjaFNwYW5zT3ZlckNoYW5nZShkb2MsIGNoYW5nZSk7XG4gICAgaWYgKCFvbGQpIHJldHVybiBzdHJldGNoZWQ7XG4gICAgaWYgKCFzdHJldGNoZWQpIHJldHVybiBvbGQ7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9sZC5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIG9sZEN1ciA9IG9sZFtpXSwgc3RyZXRjaEN1ciA9IHN0cmV0Y2hlZFtpXTtcbiAgICAgIGlmIChvbGRDdXIgJiYgc3RyZXRjaEN1cikge1xuICAgICAgICBzcGFuczogZm9yICh2YXIgaiA9IDA7IGogPCBzdHJldGNoQ3VyLmxlbmd0aDsgKytqKSB7XG4gICAgICAgICAgdmFyIHNwYW4gPSBzdHJldGNoQ3VyW2pdO1xuICAgICAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgb2xkQ3VyLmxlbmd0aDsgKytrKVxuICAgICAgICAgICAgaWYgKG9sZEN1cltrXS5tYXJrZXIgPT0gc3Bhbi5tYXJrZXIpIGNvbnRpbnVlIHNwYW5zO1xuICAgICAgICAgIG9sZEN1ci5wdXNoKHNwYW4pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHN0cmV0Y2hDdXIpIHtcbiAgICAgICAgb2xkW2ldID0gc3RyZXRjaEN1cjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9sZDtcbiAgfVxuXG4gIC8vIFVzZWQgdG8gJ2NsaXAnIG91dCByZWFkT25seSByYW5nZXMgd2hlbiBtYWtpbmcgYSBjaGFuZ2UuXG4gIGZ1bmN0aW9uIHJlbW92ZVJlYWRPbmx5UmFuZ2VzKGRvYywgZnJvbSwgdG8pIHtcbiAgICB2YXIgbWFya2VycyA9IG51bGw7XG4gICAgZG9jLml0ZXIoZnJvbS5saW5lLCB0by5saW5lICsgMSwgZnVuY3Rpb24obGluZSkge1xuICAgICAgaWYgKGxpbmUubWFya2VkU3BhbnMpIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZS5tYXJrZWRTcGFucy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgbWFyayA9IGxpbmUubWFya2VkU3BhbnNbaV0ubWFya2VyO1xuICAgICAgICBpZiAobWFyay5yZWFkT25seSAmJiAoIW1hcmtlcnMgfHwgaW5kZXhPZihtYXJrZXJzLCBtYXJrKSA9PSAtMSkpXG4gICAgICAgICAgKG1hcmtlcnMgfHwgKG1hcmtlcnMgPSBbXSkpLnB1c2gobWFyayk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKCFtYXJrZXJzKSByZXR1cm4gbnVsbDtcbiAgICB2YXIgcGFydHMgPSBbe2Zyb206IGZyb20sIHRvOiB0b31dO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIG1rID0gbWFya2Vyc1tpXSwgbSA9IG1rLmZpbmQoMCk7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHBhcnRzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgIHZhciBwID0gcGFydHNbal07XG4gICAgICAgIGlmIChjbXAocC50bywgbS5mcm9tKSA8IDAgfHwgY21wKHAuZnJvbSwgbS50bykgPiAwKSBjb250aW51ZTtcbiAgICAgICAgdmFyIG5ld1BhcnRzID0gW2osIDFdLCBkZnJvbSA9IGNtcChwLmZyb20sIG0uZnJvbSksIGR0byA9IGNtcChwLnRvLCBtLnRvKTtcbiAgICAgICAgaWYgKGRmcm9tIDwgMCB8fCAhbWsuaW5jbHVzaXZlTGVmdCAmJiAhZGZyb20pXG4gICAgICAgICAgbmV3UGFydHMucHVzaCh7ZnJvbTogcC5mcm9tLCB0bzogbS5mcm9tfSk7XG4gICAgICAgIGlmIChkdG8gPiAwIHx8ICFtay5pbmNsdXNpdmVSaWdodCAmJiAhZHRvKVxuICAgICAgICAgIG5ld1BhcnRzLnB1c2goe2Zyb206IG0udG8sIHRvOiBwLnRvfSk7XG4gICAgICAgIHBhcnRzLnNwbGljZS5hcHBseShwYXJ0cywgbmV3UGFydHMpO1xuICAgICAgICBqICs9IG5ld1BhcnRzLmxlbmd0aCAtIDE7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwYXJ0cztcbiAgfVxuXG4gIC8vIENvbm5lY3Qgb3IgZGlzY29ubmVjdCBzcGFucyBmcm9tIGEgbGluZS5cbiAgZnVuY3Rpb24gZGV0YWNoTWFya2VkU3BhbnMobGluZSkge1xuICAgIHZhciBzcGFucyA9IGxpbmUubWFya2VkU3BhbnM7XG4gICAgaWYgKCFzcGFucykgcmV0dXJuO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpXG4gICAgICBzcGFuc1tpXS5tYXJrZXIuZGV0YWNoTGluZShsaW5lKTtcbiAgICBsaW5lLm1hcmtlZFNwYW5zID0gbnVsbDtcbiAgfVxuICBmdW5jdGlvbiBhdHRhY2hNYXJrZWRTcGFucyhsaW5lLCBzcGFucykge1xuICAgIGlmICghc3BhbnMpIHJldHVybjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKVxuICAgICAgc3BhbnNbaV0ubWFya2VyLmF0dGFjaExpbmUobGluZSk7XG4gICAgbGluZS5tYXJrZWRTcGFucyA9IHNwYW5zO1xuICB9XG5cbiAgLy8gSGVscGVycyB1c2VkIHdoZW4gY29tcHV0aW5nIHdoaWNoIG92ZXJsYXBwaW5nIGNvbGxhcHNlZCBzcGFuXG4gIC8vIGNvdW50cyBhcyB0aGUgbGFyZ2VyIG9uZS5cbiAgZnVuY3Rpb24gZXh0cmFMZWZ0KG1hcmtlcikgeyByZXR1cm4gbWFya2VyLmluY2x1c2l2ZUxlZnQgPyAtMSA6IDA7IH1cbiAgZnVuY3Rpb24gZXh0cmFSaWdodChtYXJrZXIpIHsgcmV0dXJuIG1hcmtlci5pbmNsdXNpdmVSaWdodCA/IDEgOiAwOyB9XG5cbiAgLy8gUmV0dXJucyBhIG51bWJlciBpbmRpY2F0aW5nIHdoaWNoIG9mIHR3byBvdmVybGFwcGluZyBjb2xsYXBzZWRcbiAgLy8gc3BhbnMgaXMgbGFyZ2VyIChhbmQgdGh1cyBpbmNsdWRlcyB0aGUgb3RoZXIpLiBGYWxscyBiYWNrIHRvXG4gIC8vIGNvbXBhcmluZyBpZHMgd2hlbiB0aGUgc3BhbnMgY292ZXIgZXhhY3RseSB0aGUgc2FtZSByYW5nZS5cbiAgZnVuY3Rpb24gY29tcGFyZUNvbGxhcHNlZE1hcmtlcnMoYSwgYikge1xuICAgIHZhciBsZW5EaWZmID0gYS5saW5lcy5sZW5ndGggLSBiLmxpbmVzLmxlbmd0aDtcbiAgICBpZiAobGVuRGlmZiAhPSAwKSByZXR1cm4gbGVuRGlmZjtcbiAgICB2YXIgYVBvcyA9IGEuZmluZCgpLCBiUG9zID0gYi5maW5kKCk7XG4gICAgdmFyIGZyb21DbXAgPSBjbXAoYVBvcy5mcm9tLCBiUG9zLmZyb20pIHx8IGV4dHJhTGVmdChhKSAtIGV4dHJhTGVmdChiKTtcbiAgICBpZiAoZnJvbUNtcCkgcmV0dXJuIC1mcm9tQ21wO1xuICAgIHZhciB0b0NtcCA9IGNtcChhUG9zLnRvLCBiUG9zLnRvKSB8fCBleHRyYVJpZ2h0KGEpIC0gZXh0cmFSaWdodChiKTtcbiAgICBpZiAodG9DbXApIHJldHVybiB0b0NtcDtcbiAgICByZXR1cm4gYi5pZCAtIGEuaWQ7XG4gIH1cblxuICAvLyBGaW5kIG91dCB3aGV0aGVyIGEgbGluZSBlbmRzIG9yIHN0YXJ0cyBpbiBhIGNvbGxhcHNlZCBzcGFuLiBJZlxuICAvLyBzbywgcmV0dXJuIHRoZSBtYXJrZXIgZm9yIHRoYXQgc3Bhbi5cbiAgZnVuY3Rpb24gY29sbGFwc2VkU3BhbkF0U2lkZShsaW5lLCBzdGFydCkge1xuICAgIHZhciBzcHMgPSBzYXdDb2xsYXBzZWRTcGFucyAmJiBsaW5lLm1hcmtlZFNwYW5zLCBmb3VuZDtcbiAgICBpZiAoc3BzKSBmb3IgKHZhciBzcCwgaSA9IDA7IGkgPCBzcHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHNwID0gc3BzW2ldO1xuICAgICAgaWYgKHNwLm1hcmtlci5jb2xsYXBzZWQgJiYgKHN0YXJ0ID8gc3AuZnJvbSA6IHNwLnRvKSA9PSBudWxsICYmXG4gICAgICAgICAgKCFmb3VuZCB8fCBjb21wYXJlQ29sbGFwc2VkTWFya2Vycyhmb3VuZCwgc3AubWFya2VyKSA8IDApKVxuICAgICAgICBmb3VuZCA9IHNwLm1hcmtlcjtcbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kO1xuICB9XG4gIGZ1bmN0aW9uIGNvbGxhcHNlZFNwYW5BdFN0YXJ0KGxpbmUpIHsgcmV0dXJuIGNvbGxhcHNlZFNwYW5BdFNpZGUobGluZSwgdHJ1ZSk7IH1cbiAgZnVuY3Rpb24gY29sbGFwc2VkU3BhbkF0RW5kKGxpbmUpIHsgcmV0dXJuIGNvbGxhcHNlZFNwYW5BdFNpZGUobGluZSwgZmFsc2UpOyB9XG5cbiAgLy8gVGVzdCB3aGV0aGVyIHRoZXJlIGV4aXN0cyBhIGNvbGxhcHNlZCBzcGFuIHRoYXQgcGFydGlhbGx5XG4gIC8vIG92ZXJsYXBzIChjb3ZlcnMgdGhlIHN0YXJ0IG9yIGVuZCwgYnV0IG5vdCBib3RoKSBvZiBhIG5ldyBzcGFuLlxuICAvLyBTdWNoIG92ZXJsYXAgaXMgbm90IGFsbG93ZWQuXG4gIGZ1bmN0aW9uIGNvbmZsaWN0aW5nQ29sbGFwc2VkUmFuZ2UoZG9jLCBsaW5lTm8sIGZyb20sIHRvLCBtYXJrZXIpIHtcbiAgICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBsaW5lTm8pO1xuICAgIHZhciBzcHMgPSBzYXdDb2xsYXBzZWRTcGFucyAmJiBsaW5lLm1hcmtlZFNwYW5zO1xuICAgIGlmIChzcHMpIGZvciAodmFyIGkgPSAwOyBpIDwgc3BzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3AgPSBzcHNbaV07XG4gICAgICBpZiAoIXNwLm1hcmtlci5jb2xsYXBzZWQpIGNvbnRpbnVlO1xuICAgICAgdmFyIGZvdW5kID0gc3AubWFya2VyLmZpbmQoMCk7XG4gICAgICB2YXIgZnJvbUNtcCA9IGNtcChmb3VuZC5mcm9tLCBmcm9tKSB8fCBleHRyYUxlZnQoc3AubWFya2VyKSAtIGV4dHJhTGVmdChtYXJrZXIpO1xuICAgICAgdmFyIHRvQ21wID0gY21wKGZvdW5kLnRvLCB0bykgfHwgZXh0cmFSaWdodChzcC5tYXJrZXIpIC0gZXh0cmFSaWdodChtYXJrZXIpO1xuICAgICAgaWYgKGZyb21DbXAgPj0gMCAmJiB0b0NtcCA8PSAwIHx8IGZyb21DbXAgPD0gMCAmJiB0b0NtcCA+PSAwKSBjb250aW51ZTtcbiAgICAgIGlmIChmcm9tQ21wIDw9IDAgJiYgKGNtcChmb3VuZC50bywgZnJvbSkgPiAwIHx8IChzcC5tYXJrZXIuaW5jbHVzaXZlUmlnaHQgJiYgbWFya2VyLmluY2x1c2l2ZUxlZnQpKSB8fFxuICAgICAgICAgIGZyb21DbXAgPj0gMCAmJiAoY21wKGZvdW5kLmZyb20sIHRvKSA8IDAgfHwgKHNwLm1hcmtlci5pbmNsdXNpdmVMZWZ0ICYmIG1hcmtlci5pbmNsdXNpdmVSaWdodCkpKVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICAvLyBBIHZpc3VhbCBsaW5lIGlzIGEgbGluZSBhcyBkcmF3biBvbiB0aGUgc2NyZWVuLiBGb2xkaW5nLCBmb3JcbiAgLy8gZXhhbXBsZSwgY2FuIGNhdXNlIG11bHRpcGxlIGxvZ2ljYWwgbGluZXMgdG8gYXBwZWFyIG9uIHRoZSBzYW1lXG4gIC8vIHZpc3VhbCBsaW5lLiBUaGlzIGZpbmRzIHRoZSBzdGFydCBvZiB0aGUgdmlzdWFsIGxpbmUgdGhhdCB0aGVcbiAgLy8gZ2l2ZW4gbGluZSBpcyBwYXJ0IG9mICh1c3VhbGx5IHRoYXQgaXMgdGhlIGxpbmUgaXRzZWxmKS5cbiAgZnVuY3Rpb24gdmlzdWFsTGluZShsaW5lKSB7XG4gICAgdmFyIG1lcmdlZDtcbiAgICB3aGlsZSAobWVyZ2VkID0gY29sbGFwc2VkU3BhbkF0U3RhcnQobGluZSkpXG4gICAgICBsaW5lID0gbWVyZ2VkLmZpbmQoLTEsIHRydWUpLmxpbmU7XG4gICAgcmV0dXJuIGxpbmU7XG4gIH1cblxuICAvLyBSZXR1cm5zIGFuIGFycmF5IG9mIGxvZ2ljYWwgbGluZXMgdGhhdCBjb250aW51ZSB0aGUgdmlzdWFsIGxpbmVcbiAgLy8gc3RhcnRlZCBieSB0aGUgYXJndW1lbnQsIG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBhcmUgbm8gc3VjaCBsaW5lcy5cbiAgZnVuY3Rpb24gdmlzdWFsTGluZUNvbnRpbnVlZChsaW5lKSB7XG4gICAgdmFyIG1lcmdlZCwgbGluZXM7XG4gICAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdEVuZChsaW5lKSkge1xuICAgICAgbGluZSA9IG1lcmdlZC5maW5kKDEsIHRydWUpLmxpbmU7XG4gICAgICAobGluZXMgfHwgKGxpbmVzID0gW10pKS5wdXNoKGxpbmUpO1xuICAgIH1cbiAgICByZXR1cm4gbGluZXM7XG4gIH1cblxuICAvLyBHZXQgdGhlIGxpbmUgbnVtYmVyIG9mIHRoZSBzdGFydCBvZiB0aGUgdmlzdWFsIGxpbmUgdGhhdCB0aGVcbiAgLy8gZ2l2ZW4gbGluZSBudW1iZXIgaXMgcGFydCBvZi5cbiAgZnVuY3Rpb24gdmlzdWFsTGluZU5vKGRvYywgbGluZU4pIHtcbiAgICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBsaW5lTiksIHZpcyA9IHZpc3VhbExpbmUobGluZSk7XG4gICAgaWYgKGxpbmUgPT0gdmlzKSByZXR1cm4gbGluZU47XG4gICAgcmV0dXJuIGxpbmVObyh2aXMpO1xuICB9XG4gIC8vIEdldCB0aGUgbGluZSBudW1iZXIgb2YgdGhlIHN0YXJ0IG9mIHRoZSBuZXh0IHZpc3VhbCBsaW5lIGFmdGVyXG4gIC8vIHRoZSBnaXZlbiBsaW5lLlxuICBmdW5jdGlvbiB2aXN1YWxMaW5lRW5kTm8oZG9jLCBsaW5lTikge1xuICAgIGlmIChsaW5lTiA+IGRvYy5sYXN0TGluZSgpKSByZXR1cm4gbGluZU47XG4gICAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgbGluZU4pLCBtZXJnZWQ7XG4gICAgaWYgKCFsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKSkgcmV0dXJuIGxpbmVOO1xuICAgIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRFbmQobGluZSkpXG4gICAgICBsaW5lID0gbWVyZ2VkLmZpbmQoMSwgdHJ1ZSkubGluZTtcbiAgICByZXR1cm4gbGluZU5vKGxpbmUpICsgMTtcbiAgfVxuXG4gIC8vIENvbXB1dGUgd2hldGhlciBhIGxpbmUgaXMgaGlkZGVuLiBMaW5lcyBjb3VudCBhcyBoaWRkZW4gd2hlbiB0aGV5XG4gIC8vIGFyZSBwYXJ0IG9mIGEgdmlzdWFsIGxpbmUgdGhhdCBzdGFydHMgd2l0aCBhbm90aGVyIGxpbmUsIG9yIHdoZW5cbiAgLy8gdGhleSBhcmUgZW50aXJlbHkgY292ZXJlZCBieSBjb2xsYXBzZWQsIG5vbi13aWRnZXQgc3Bhbi5cbiAgZnVuY3Rpb24gbGluZUlzSGlkZGVuKGRvYywgbGluZSkge1xuICAgIHZhciBzcHMgPSBzYXdDb2xsYXBzZWRTcGFucyAmJiBsaW5lLm1hcmtlZFNwYW5zO1xuICAgIGlmIChzcHMpIGZvciAodmFyIHNwLCBpID0gMDsgaSA8IHNwcy5sZW5ndGg7ICsraSkge1xuICAgICAgc3AgPSBzcHNbaV07XG4gICAgICBpZiAoIXNwLm1hcmtlci5jb2xsYXBzZWQpIGNvbnRpbnVlO1xuICAgICAgaWYgKHNwLmZyb20gPT0gbnVsbCkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAoc3AubWFya2VyLndpZGdldE5vZGUpIGNvbnRpbnVlO1xuICAgICAgaWYgKHNwLmZyb20gPT0gMCAmJiBzcC5tYXJrZXIuaW5jbHVzaXZlTGVmdCAmJiBsaW5lSXNIaWRkZW5Jbm5lcihkb2MsIGxpbmUsIHNwKSlcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIGZ1bmN0aW9uIGxpbmVJc0hpZGRlbklubmVyKGRvYywgbGluZSwgc3Bhbikge1xuICAgIGlmIChzcGFuLnRvID09IG51bGwpIHtcbiAgICAgIHZhciBlbmQgPSBzcGFuLm1hcmtlci5maW5kKDEsIHRydWUpO1xuICAgICAgcmV0dXJuIGxpbmVJc0hpZGRlbklubmVyKGRvYywgZW5kLmxpbmUsIGdldE1hcmtlZFNwYW5Gb3IoZW5kLmxpbmUubWFya2VkU3BhbnMsIHNwYW4ubWFya2VyKSk7XG4gICAgfVxuICAgIGlmIChzcGFuLm1hcmtlci5pbmNsdXNpdmVSaWdodCAmJiBzcGFuLnRvID09IGxpbmUudGV4dC5sZW5ndGgpXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICBmb3IgKHZhciBzcCwgaSA9IDA7IGkgPCBsaW5lLm1hcmtlZFNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgICBzcCA9IGxpbmUubWFya2VkU3BhbnNbaV07XG4gICAgICBpZiAoc3AubWFya2VyLmNvbGxhcHNlZCAmJiAhc3AubWFya2VyLndpZGdldE5vZGUgJiYgc3AuZnJvbSA9PSBzcGFuLnRvICYmXG4gICAgICAgICAgKHNwLnRvID09IG51bGwgfHwgc3AudG8gIT0gc3Bhbi5mcm9tKSAmJlxuICAgICAgICAgIChzcC5tYXJrZXIuaW5jbHVzaXZlTGVmdCB8fCBzcGFuLm1hcmtlci5pbmNsdXNpdmVSaWdodCkgJiZcbiAgICAgICAgICBsaW5lSXNIaWRkZW5Jbm5lcihkb2MsIGxpbmUsIHNwKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgLy8gTElORSBXSURHRVRTXG5cbiAgLy8gTGluZSB3aWRnZXRzIGFyZSBibG9jayBlbGVtZW50cyBkaXNwbGF5ZWQgYWJvdmUgb3IgYmVsb3cgYSBsaW5lLlxuXG4gIHZhciBMaW5lV2lkZ2V0ID0gQ29kZU1pcnJvci5MaW5lV2lkZ2V0ID0gZnVuY3Rpb24oZG9jLCBub2RlLCBvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMpIGZvciAodmFyIG9wdCBpbiBvcHRpb25zKSBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShvcHQpKVxuICAgICAgdGhpc1tvcHRdID0gb3B0aW9uc1tvcHRdO1xuICAgIHRoaXMuZG9jID0gZG9jO1xuICAgIHRoaXMubm9kZSA9IG5vZGU7XG4gIH07XG4gIGV2ZW50TWl4aW4oTGluZVdpZGdldCk7XG5cbiAgZnVuY3Rpb24gYWRqdXN0U2Nyb2xsV2hlbkFib3ZlVmlzaWJsZShjbSwgbGluZSwgZGlmZikge1xuICAgIGlmIChoZWlnaHRBdExpbmUobGluZSkgPCAoKGNtLmN1ck9wICYmIGNtLmN1ck9wLnNjcm9sbFRvcCkgfHwgY20uZG9jLnNjcm9sbFRvcCkpXG4gICAgICBhZGRUb1Njcm9sbFBvcyhjbSwgbnVsbCwgZGlmZik7XG4gIH1cblxuICBMaW5lV2lkZ2V0LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjbSA9IHRoaXMuZG9jLmNtLCB3cyA9IHRoaXMubGluZS53aWRnZXRzLCBsaW5lID0gdGhpcy5saW5lLCBubyA9IGxpbmVObyhsaW5lKTtcbiAgICBpZiAobm8gPT0gbnVsbCB8fCAhd3MpIHJldHVybjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHdzLmxlbmd0aDsgKytpKSBpZiAod3NbaV0gPT0gdGhpcykgd3Muc3BsaWNlKGktLSwgMSk7XG4gICAgaWYgKCF3cy5sZW5ndGgpIGxpbmUud2lkZ2V0cyA9IG51bGw7XG4gICAgdmFyIGhlaWdodCA9IHdpZGdldEhlaWdodCh0aGlzKTtcbiAgICB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIE1hdGgubWF4KDAsIGxpbmUuaGVpZ2h0IC0gaGVpZ2h0KSk7XG4gICAgaWYgKGNtKSBydW5Jbk9wKGNtLCBmdW5jdGlvbigpIHtcbiAgICAgIGFkanVzdFNjcm9sbFdoZW5BYm92ZVZpc2libGUoY20sIGxpbmUsIC1oZWlnaHQpO1xuICAgICAgcmVnTGluZUNoYW5nZShjbSwgbm8sIFwid2lkZ2V0XCIpO1xuICAgIH0pO1xuICB9O1xuICBMaW5lV2lkZ2V0LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG9sZEggPSB0aGlzLmhlaWdodCwgY20gPSB0aGlzLmRvYy5jbSwgbGluZSA9IHRoaXMubGluZTtcbiAgICB0aGlzLmhlaWdodCA9IG51bGw7XG4gICAgdmFyIGRpZmYgPSB3aWRnZXRIZWlnaHQodGhpcykgLSBvbGRIO1xuICAgIGlmICghZGlmZikgcmV0dXJuO1xuICAgIHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgbGluZS5oZWlnaHQgKyBkaWZmKTtcbiAgICBpZiAoY20pIHJ1bkluT3AoY20sIGZ1bmN0aW9uKCkge1xuICAgICAgY20uY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgICAgYWRqdXN0U2Nyb2xsV2hlbkFib3ZlVmlzaWJsZShjbSwgbGluZSwgZGlmZik7XG4gICAgfSk7XG4gIH07XG5cbiAgZnVuY3Rpb24gd2lkZ2V0SGVpZ2h0KHdpZGdldCkge1xuICAgIGlmICh3aWRnZXQuaGVpZ2h0ICE9IG51bGwpIHJldHVybiB3aWRnZXQuaGVpZ2h0O1xuICAgIHZhciBjbSA9IHdpZGdldC5kb2MuY207XG4gICAgaWYgKCFjbSkgcmV0dXJuIDA7XG4gICAgaWYgKCFjb250YWlucyhkb2N1bWVudC5ib2R5LCB3aWRnZXQubm9kZSkpIHtcbiAgICAgIHZhciBwYXJlbnRTdHlsZSA9IFwicG9zaXRpb246IHJlbGF0aXZlO1wiO1xuICAgICAgaWYgKHdpZGdldC5jb3Zlckd1dHRlcilcbiAgICAgICAgcGFyZW50U3R5bGUgKz0gXCJtYXJnaW4tbGVmdDogLVwiICsgY20uZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoICsgXCJweDtcIjtcbiAgICAgIGlmICh3aWRnZXQubm9IU2Nyb2xsKVxuICAgICAgICBwYXJlbnRTdHlsZSArPSBcIndpZHRoOiBcIiArIGNtLmRpc3BsYXkud3JhcHBlci5jbGllbnRXaWR0aCArIFwicHg7XCI7XG4gICAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChjbS5kaXNwbGF5Lm1lYXN1cmUsIGVsdChcImRpdlwiLCBbd2lkZ2V0Lm5vZGVdLCBudWxsLCBwYXJlbnRTdHlsZSkpO1xuICAgIH1cbiAgICByZXR1cm4gd2lkZ2V0LmhlaWdodCA9IHdpZGdldC5ub2RlLm9mZnNldEhlaWdodDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFkZExpbmVXaWRnZXQoZG9jLCBoYW5kbGUsIG5vZGUsIG9wdGlvbnMpIHtcbiAgICB2YXIgd2lkZ2V0ID0gbmV3IExpbmVXaWRnZXQoZG9jLCBub2RlLCBvcHRpb25zKTtcbiAgICB2YXIgY20gPSBkb2MuY207XG4gICAgaWYgKGNtICYmIHdpZGdldC5ub0hTY3JvbGwpIGNtLmRpc3BsYXkuYWxpZ25XaWRnZXRzID0gdHJ1ZTtcbiAgICBjaGFuZ2VMaW5lKGRvYywgaGFuZGxlLCBcIndpZGdldFwiLCBmdW5jdGlvbihsaW5lKSB7XG4gICAgICB2YXIgd2lkZ2V0cyA9IGxpbmUud2lkZ2V0cyB8fCAobGluZS53aWRnZXRzID0gW10pO1xuICAgICAgaWYgKHdpZGdldC5pbnNlcnRBdCA9PSBudWxsKSB3aWRnZXRzLnB1c2god2lkZ2V0KTtcbiAgICAgIGVsc2Ugd2lkZ2V0cy5zcGxpY2UoTWF0aC5taW4od2lkZ2V0cy5sZW5ndGggLSAxLCBNYXRoLm1heCgwLCB3aWRnZXQuaW5zZXJ0QXQpKSwgMCwgd2lkZ2V0KTtcbiAgICAgIHdpZGdldC5saW5lID0gbGluZTtcbiAgICAgIGlmIChjbSAmJiAhbGluZUlzSGlkZGVuKGRvYywgbGluZSkpIHtcbiAgICAgICAgdmFyIGFib3ZlVmlzaWJsZSA9IGhlaWdodEF0TGluZShsaW5lKSA8IGRvYy5zY3JvbGxUb3A7XG4gICAgICAgIHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgbGluZS5oZWlnaHQgKyB3aWRnZXRIZWlnaHQod2lkZ2V0KSk7XG4gICAgICAgIGlmIChhYm92ZVZpc2libGUpIGFkZFRvU2Nyb2xsUG9zKGNtLCBudWxsLCB3aWRnZXQuaGVpZ2h0KTtcbiAgICAgICAgY20uY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHdpZGdldDtcbiAgfVxuXG4gIC8vIExJTkUgREFUQSBTVFJVQ1RVUkVcblxuICAvLyBMaW5lIG9iamVjdHMuIFRoZXNlIGhvbGQgc3RhdGUgcmVsYXRlZCB0byBhIGxpbmUsIGluY2x1ZGluZ1xuICAvLyBoaWdobGlnaHRpbmcgaW5mbyAodGhlIHN0eWxlcyBhcnJheSkuXG4gIHZhciBMaW5lID0gQ29kZU1pcnJvci5MaW5lID0gZnVuY3Rpb24odGV4dCwgbWFya2VkU3BhbnMsIGVzdGltYXRlSGVpZ2h0KSB7XG4gICAgdGhpcy50ZXh0ID0gdGV4dDtcbiAgICBhdHRhY2hNYXJrZWRTcGFucyh0aGlzLCBtYXJrZWRTcGFucyk7XG4gICAgdGhpcy5oZWlnaHQgPSBlc3RpbWF0ZUhlaWdodCA/IGVzdGltYXRlSGVpZ2h0KHRoaXMpIDogMTtcbiAgfTtcbiAgZXZlbnRNaXhpbihMaW5lKTtcbiAgTGluZS5wcm90b3R5cGUubGluZU5vID0gZnVuY3Rpb24oKSB7IHJldHVybiBsaW5lTm8odGhpcyk7IH07XG5cbiAgLy8gQ2hhbmdlIHRoZSBjb250ZW50ICh0ZXh0LCBtYXJrZXJzKSBvZiBhIGxpbmUuIEF1dG9tYXRpY2FsbHlcbiAgLy8gaW52YWxpZGF0ZXMgY2FjaGVkIGluZm9ybWF0aW9uIGFuZCB0cmllcyB0byByZS1lc3RpbWF0ZSB0aGVcbiAgLy8gbGluZSdzIGhlaWdodC5cbiAgZnVuY3Rpb24gdXBkYXRlTGluZShsaW5lLCB0ZXh0LCBtYXJrZWRTcGFucywgZXN0aW1hdGVIZWlnaHQpIHtcbiAgICBsaW5lLnRleHQgPSB0ZXh0O1xuICAgIGlmIChsaW5lLnN0YXRlQWZ0ZXIpIGxpbmUuc3RhdGVBZnRlciA9IG51bGw7XG4gICAgaWYgKGxpbmUuc3R5bGVzKSBsaW5lLnN0eWxlcyA9IG51bGw7XG4gICAgaWYgKGxpbmUub3JkZXIgIT0gbnVsbCkgbGluZS5vcmRlciA9IG51bGw7XG4gICAgZGV0YWNoTWFya2VkU3BhbnMobGluZSk7XG4gICAgYXR0YWNoTWFya2VkU3BhbnMobGluZSwgbWFya2VkU3BhbnMpO1xuICAgIHZhciBlc3RIZWlnaHQgPSBlc3RpbWF0ZUhlaWdodCA/IGVzdGltYXRlSGVpZ2h0KGxpbmUpIDogMTtcbiAgICBpZiAoZXN0SGVpZ2h0ICE9IGxpbmUuaGVpZ2h0KSB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGVzdEhlaWdodCk7XG4gIH1cblxuICAvLyBEZXRhY2ggYSBsaW5lIGZyb20gdGhlIGRvY3VtZW50IHRyZWUgYW5kIGl0cyBtYXJrZXJzLlxuICBmdW5jdGlvbiBjbGVhblVwTGluZShsaW5lKSB7XG4gICAgbGluZS5wYXJlbnQgPSBudWxsO1xuICAgIGRldGFjaE1hcmtlZFNwYW5zKGxpbmUpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXh0cmFjdExpbmVDbGFzc2VzKHR5cGUsIG91dHB1dCkge1xuICAgIGlmICh0eXBlKSBmb3IgKDs7KSB7XG4gICAgICB2YXIgbGluZUNsYXNzID0gdHlwZS5tYXRjaCgvKD86XnxcXHMrKWxpbmUtKGJhY2tncm91bmQtKT8oXFxTKykvKTtcbiAgICAgIGlmICghbGluZUNsYXNzKSBicmVhaztcbiAgICAgIHR5cGUgPSB0eXBlLnNsaWNlKDAsIGxpbmVDbGFzcy5pbmRleCkgKyB0eXBlLnNsaWNlKGxpbmVDbGFzcy5pbmRleCArIGxpbmVDbGFzc1swXS5sZW5ndGgpO1xuICAgICAgdmFyIHByb3AgPSBsaW5lQ2xhc3NbMV0gPyBcImJnQ2xhc3NcIiA6IFwidGV4dENsYXNzXCI7XG4gICAgICBpZiAob3V0cHV0W3Byb3BdID09IG51bGwpXG4gICAgICAgIG91dHB1dFtwcm9wXSA9IGxpbmVDbGFzc1syXTtcbiAgICAgIGVsc2UgaWYgKCEobmV3IFJlZ0V4cChcIig/Ol58XFxzKVwiICsgbGluZUNsYXNzWzJdICsgXCIoPzokfFxccylcIikpLnRlc3Qob3V0cHV0W3Byb3BdKSlcbiAgICAgICAgb3V0cHV0W3Byb3BdICs9IFwiIFwiICsgbGluZUNsYXNzWzJdO1xuICAgIH1cbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNhbGxCbGFua0xpbmUobW9kZSwgc3RhdGUpIHtcbiAgICBpZiAobW9kZS5ibGFua0xpbmUpIHJldHVybiBtb2RlLmJsYW5rTGluZShzdGF0ZSk7XG4gICAgaWYgKCFtb2RlLmlubmVyTW9kZSkgcmV0dXJuO1xuICAgIHZhciBpbm5lciA9IENvZGVNaXJyb3IuaW5uZXJNb2RlKG1vZGUsIHN0YXRlKTtcbiAgICBpZiAoaW5uZXIubW9kZS5ibGFua0xpbmUpIHJldHVybiBpbm5lci5tb2RlLmJsYW5rTGluZShpbm5lci5zdGF0ZSk7XG4gIH1cblxuICBmdW5jdGlvbiByZWFkVG9rZW4obW9kZSwgc3RyZWFtLCBzdGF0ZSwgaW5uZXIpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDEwOyBpKyspIHtcbiAgICAgIGlmIChpbm5lcikgaW5uZXJbMF0gPSBDb2RlTWlycm9yLmlubmVyTW9kZShtb2RlLCBzdGF0ZSkubW9kZTtcbiAgICAgIHZhciBzdHlsZSA9IG1vZGUudG9rZW4oc3RyZWFtLCBzdGF0ZSk7XG4gICAgICBpZiAoc3RyZWFtLnBvcyA+IHN0cmVhbS5zdGFydCkgcmV0dXJuIHN0eWxlO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJNb2RlIFwiICsgbW9kZS5uYW1lICsgXCIgZmFpbGVkIHRvIGFkdmFuY2Ugc3RyZWFtLlwiKTtcbiAgfVxuXG4gIC8vIFV0aWxpdHkgZm9yIGdldFRva2VuQXQgYW5kIGdldExpbmVUb2tlbnNcbiAgZnVuY3Rpb24gdGFrZVRva2VuKGNtLCBwb3MsIHByZWNpc2UsIGFzQXJyYXkpIHtcbiAgICBmdW5jdGlvbiBnZXRPYmooY29weSkge1xuICAgICAgcmV0dXJuIHtzdGFydDogc3RyZWFtLnN0YXJ0LCBlbmQ6IHN0cmVhbS5wb3MsXG4gICAgICAgICAgICAgIHN0cmluZzogc3RyZWFtLmN1cnJlbnQoKSxcbiAgICAgICAgICAgICAgdHlwZTogc3R5bGUgfHwgbnVsbCxcbiAgICAgICAgICAgICAgc3RhdGU6IGNvcHkgPyBjb3B5U3RhdGUoZG9jLm1vZGUsIHN0YXRlKSA6IHN0YXRlfTtcbiAgICB9XG5cbiAgICB2YXIgZG9jID0gY20uZG9jLCBtb2RlID0gZG9jLm1vZGUsIHN0eWxlO1xuICAgIHBvcyA9IGNsaXBQb3MoZG9jLCBwb3MpO1xuICAgIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIHBvcy5saW5lKSwgc3RhdGUgPSBnZXRTdGF0ZUJlZm9yZShjbSwgcG9zLmxpbmUsIHByZWNpc2UpO1xuICAgIHZhciBzdHJlYW0gPSBuZXcgU3RyaW5nU3RyZWFtKGxpbmUudGV4dCwgY20ub3B0aW9ucy50YWJTaXplKSwgdG9rZW5zO1xuICAgIGlmIChhc0FycmF5KSB0b2tlbnMgPSBbXTtcbiAgICB3aGlsZSAoKGFzQXJyYXkgfHwgc3RyZWFtLnBvcyA8IHBvcy5jaCkgJiYgIXN0cmVhbS5lb2woKSkge1xuICAgICAgc3RyZWFtLnN0YXJ0ID0gc3RyZWFtLnBvcztcbiAgICAgIHN0eWxlID0gcmVhZFRva2VuKG1vZGUsIHN0cmVhbSwgc3RhdGUpO1xuICAgICAgaWYgKGFzQXJyYXkpIHRva2Vucy5wdXNoKGdldE9iaih0cnVlKSk7XG4gICAgfVxuICAgIHJldHVybiBhc0FycmF5ID8gdG9rZW5zIDogZ2V0T2JqKCk7XG4gIH1cblxuICAvLyBSdW4gdGhlIGdpdmVuIG1vZGUncyBwYXJzZXIgb3ZlciBhIGxpbmUsIGNhbGxpbmcgZiBmb3IgZWFjaCB0b2tlbi5cbiAgZnVuY3Rpb24gcnVuTW9kZShjbSwgdGV4dCwgbW9kZSwgc3RhdGUsIGYsIGxpbmVDbGFzc2VzLCBmb3JjZVRvRW5kKSB7XG4gICAgdmFyIGZsYXR0ZW5TcGFucyA9IG1vZGUuZmxhdHRlblNwYW5zO1xuICAgIGlmIChmbGF0dGVuU3BhbnMgPT0gbnVsbCkgZmxhdHRlblNwYW5zID0gY20ub3B0aW9ucy5mbGF0dGVuU3BhbnM7XG4gICAgdmFyIGN1clN0YXJ0ID0gMCwgY3VyU3R5bGUgPSBudWxsO1xuICAgIHZhciBzdHJlYW0gPSBuZXcgU3RyaW5nU3RyZWFtKHRleHQsIGNtLm9wdGlvbnMudGFiU2l6ZSksIHN0eWxlO1xuICAgIHZhciBpbm5lciA9IGNtLm9wdGlvbnMuYWRkTW9kZUNsYXNzICYmIFtudWxsXTtcbiAgICBpZiAodGV4dCA9PSBcIlwiKSBleHRyYWN0TGluZUNsYXNzZXMoY2FsbEJsYW5rTGluZShtb2RlLCBzdGF0ZSksIGxpbmVDbGFzc2VzKTtcbiAgICB3aGlsZSAoIXN0cmVhbS5lb2woKSkge1xuICAgICAgaWYgKHN0cmVhbS5wb3MgPiBjbS5vcHRpb25zLm1heEhpZ2hsaWdodExlbmd0aCkge1xuICAgICAgICBmbGF0dGVuU3BhbnMgPSBmYWxzZTtcbiAgICAgICAgaWYgKGZvcmNlVG9FbmQpIHByb2Nlc3NMaW5lKGNtLCB0ZXh0LCBzdGF0ZSwgc3RyZWFtLnBvcyk7XG4gICAgICAgIHN0cmVhbS5wb3MgPSB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgc3R5bGUgPSBudWxsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3R5bGUgPSBleHRyYWN0TGluZUNsYXNzZXMocmVhZFRva2VuKG1vZGUsIHN0cmVhbSwgc3RhdGUsIGlubmVyKSwgbGluZUNsYXNzZXMpO1xuICAgICAgfVxuICAgICAgaWYgKGlubmVyKSB7XG4gICAgICAgIHZhciBtTmFtZSA9IGlubmVyWzBdLm5hbWU7XG4gICAgICAgIGlmIChtTmFtZSkgc3R5bGUgPSBcIm0tXCIgKyAoc3R5bGUgPyBtTmFtZSArIFwiIFwiICsgc3R5bGUgOiBtTmFtZSk7XG4gICAgICB9XG4gICAgICBpZiAoIWZsYXR0ZW5TcGFucyB8fCBjdXJTdHlsZSAhPSBzdHlsZSkge1xuICAgICAgICB3aGlsZSAoY3VyU3RhcnQgPCBzdHJlYW0uc3RhcnQpIHtcbiAgICAgICAgICBjdXJTdGFydCA9IE1hdGgubWluKHN0cmVhbS5zdGFydCwgY3VyU3RhcnQgKyA1MDAwMCk7XG4gICAgICAgICAgZihjdXJTdGFydCwgY3VyU3R5bGUpO1xuICAgICAgICB9XG4gICAgICAgIGN1clN0eWxlID0gc3R5bGU7XG4gICAgICB9XG4gICAgICBzdHJlYW0uc3RhcnQgPSBzdHJlYW0ucG9zO1xuICAgIH1cbiAgICB3aGlsZSAoY3VyU3RhcnQgPCBzdHJlYW0ucG9zKSB7XG4gICAgICAvLyBXZWJraXQgc2VlbXMgdG8gcmVmdXNlIHRvIHJlbmRlciB0ZXh0IG5vZGVzIGxvbmdlciB0aGFuIDU3NDQ0IGNoYXJhY3RlcnNcbiAgICAgIHZhciBwb3MgPSBNYXRoLm1pbihzdHJlYW0ucG9zLCBjdXJTdGFydCArIDUwMDAwKTtcbiAgICAgIGYocG9zLCBjdXJTdHlsZSk7XG4gICAgICBjdXJTdGFydCA9IHBvcztcbiAgICB9XG4gIH1cblxuICAvLyBDb21wdXRlIGEgc3R5bGUgYXJyYXkgKGFuIGFycmF5IHN0YXJ0aW5nIHdpdGggYSBtb2RlIGdlbmVyYXRpb25cbiAgLy8gLS0gZm9yIGludmFsaWRhdGlvbiAtLSBmb2xsb3dlZCBieSBwYWlycyBvZiBlbmQgcG9zaXRpb25zIGFuZFxuICAvLyBzdHlsZSBzdHJpbmdzKSwgd2hpY2ggaXMgdXNlZCB0byBoaWdobGlnaHQgdGhlIHRva2VucyBvbiB0aGVcbiAgLy8gbGluZS5cbiAgZnVuY3Rpb24gaGlnaGxpZ2h0TGluZShjbSwgbGluZSwgc3RhdGUsIGZvcmNlVG9FbmQpIHtcbiAgICAvLyBBIHN0eWxlcyBhcnJheSBhbHdheXMgc3RhcnRzIHdpdGggYSBudW1iZXIgaWRlbnRpZnlpbmcgdGhlXG4gICAgLy8gbW9kZS9vdmVybGF5cyB0aGF0IGl0IGlzIGJhc2VkIG9uIChmb3IgZWFzeSBpbnZhbGlkYXRpb24pLlxuICAgIHZhciBzdCA9IFtjbS5zdGF0ZS5tb2RlR2VuXSwgbGluZUNsYXNzZXMgPSB7fTtcbiAgICAvLyBDb21wdXRlIHRoZSBiYXNlIGFycmF5IG9mIHN0eWxlc1xuICAgIHJ1bk1vZGUoY20sIGxpbmUudGV4dCwgY20uZG9jLm1vZGUsIHN0YXRlLCBmdW5jdGlvbihlbmQsIHN0eWxlKSB7XG4gICAgICBzdC5wdXNoKGVuZCwgc3R5bGUpO1xuICAgIH0sIGxpbmVDbGFzc2VzLCBmb3JjZVRvRW5kKTtcblxuICAgIC8vIFJ1biBvdmVybGF5cywgYWRqdXN0IHN0eWxlIGFycmF5LlxuICAgIGZvciAodmFyIG8gPSAwOyBvIDwgY20uc3RhdGUub3ZlcmxheXMubGVuZ3RoOyArK28pIHtcbiAgICAgIHZhciBvdmVybGF5ID0gY20uc3RhdGUub3ZlcmxheXNbb10sIGkgPSAxLCBhdCA9IDA7XG4gICAgICBydW5Nb2RlKGNtLCBsaW5lLnRleHQsIG92ZXJsYXkubW9kZSwgdHJ1ZSwgZnVuY3Rpb24oZW5kLCBzdHlsZSkge1xuICAgICAgICB2YXIgc3RhcnQgPSBpO1xuICAgICAgICAvLyBFbnN1cmUgdGhlcmUncyBhIHRva2VuIGVuZCBhdCB0aGUgY3VycmVudCBwb3NpdGlvbiwgYW5kIHRoYXQgaSBwb2ludHMgYXQgaXRcbiAgICAgICAgd2hpbGUgKGF0IDwgZW5kKSB7XG4gICAgICAgICAgdmFyIGlfZW5kID0gc3RbaV07XG4gICAgICAgICAgaWYgKGlfZW5kID4gZW5kKVxuICAgICAgICAgICAgc3Quc3BsaWNlKGksIDEsIGVuZCwgc3RbaSsxXSwgaV9lbmQpO1xuICAgICAgICAgIGkgKz0gMjtcbiAgICAgICAgICBhdCA9IE1hdGgubWluKGVuZCwgaV9lbmQpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc3R5bGUpIHJldHVybjtcbiAgICAgICAgaWYgKG92ZXJsYXkub3BhcXVlKSB7XG4gICAgICAgICAgc3Quc3BsaWNlKHN0YXJ0LCBpIC0gc3RhcnQsIGVuZCwgXCJjbS1vdmVybGF5IFwiICsgc3R5bGUpO1xuICAgICAgICAgIGkgPSBzdGFydCArIDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICg7IHN0YXJ0IDwgaTsgc3RhcnQgKz0gMikge1xuICAgICAgICAgICAgdmFyIGN1ciA9IHN0W3N0YXJ0KzFdO1xuICAgICAgICAgICAgc3Rbc3RhcnQrMV0gPSAoY3VyID8gY3VyICsgXCIgXCIgOiBcIlwiKSArIFwiY20tb3ZlcmxheSBcIiArIHN0eWxlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSwgbGluZUNsYXNzZXMpO1xuICAgIH1cblxuICAgIHJldHVybiB7c3R5bGVzOiBzdCwgY2xhc3NlczogbGluZUNsYXNzZXMuYmdDbGFzcyB8fCBsaW5lQ2xhc3Nlcy50ZXh0Q2xhc3MgPyBsaW5lQ2xhc3NlcyA6IG51bGx9O1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0TGluZVN0eWxlcyhjbSwgbGluZSwgdXBkYXRlRnJvbnRpZXIpIHtcbiAgICBpZiAoIWxpbmUuc3R5bGVzIHx8IGxpbmUuc3R5bGVzWzBdICE9IGNtLnN0YXRlLm1vZGVHZW4pIHtcbiAgICAgIHZhciBzdGF0ZSA9IGdldFN0YXRlQmVmb3JlKGNtLCBsaW5lTm8obGluZSkpO1xuICAgICAgdmFyIHJlc3VsdCA9IGhpZ2hsaWdodExpbmUoY20sIGxpbmUsIGxpbmUudGV4dC5sZW5ndGggPiBjbS5vcHRpb25zLm1heEhpZ2hsaWdodExlbmd0aCA/IGNvcHlTdGF0ZShjbS5kb2MubW9kZSwgc3RhdGUpIDogc3RhdGUpO1xuICAgICAgbGluZS5zdGF0ZUFmdGVyID0gc3RhdGU7XG4gICAgICBsaW5lLnN0eWxlcyA9IHJlc3VsdC5zdHlsZXM7XG4gICAgICBpZiAocmVzdWx0LmNsYXNzZXMpIGxpbmUuc3R5bGVDbGFzc2VzID0gcmVzdWx0LmNsYXNzZXM7XG4gICAgICBlbHNlIGlmIChsaW5lLnN0eWxlQ2xhc3NlcykgbGluZS5zdHlsZUNsYXNzZXMgPSBudWxsO1xuICAgICAgaWYgKHVwZGF0ZUZyb250aWVyID09PSBjbS5kb2MuZnJvbnRpZXIpIGNtLmRvYy5mcm9udGllcisrO1xuICAgIH1cbiAgICByZXR1cm4gbGluZS5zdHlsZXM7XG4gIH1cblxuICAvLyBMaWdodHdlaWdodCBmb3JtIG9mIGhpZ2hsaWdodCAtLSBwcm9jZWVkIG92ZXIgdGhpcyBsaW5lIGFuZFxuICAvLyB1cGRhdGUgc3RhdGUsIGJ1dCBkb24ndCBzYXZlIGEgc3R5bGUgYXJyYXkuIFVzZWQgZm9yIGxpbmVzIHRoYXRcbiAgLy8gYXJlbid0IGN1cnJlbnRseSB2aXNpYmxlLlxuICBmdW5jdGlvbiBwcm9jZXNzTGluZShjbSwgdGV4dCwgc3RhdGUsIHN0YXJ0QXQpIHtcbiAgICB2YXIgbW9kZSA9IGNtLmRvYy5tb2RlO1xuICAgIHZhciBzdHJlYW0gPSBuZXcgU3RyaW5nU3RyZWFtKHRleHQsIGNtLm9wdGlvbnMudGFiU2l6ZSk7XG4gICAgc3RyZWFtLnN0YXJ0ID0gc3RyZWFtLnBvcyA9IHN0YXJ0QXQgfHwgMDtcbiAgICBpZiAodGV4dCA9PSBcIlwiKSBjYWxsQmxhbmtMaW5lKG1vZGUsIHN0YXRlKTtcbiAgICB3aGlsZSAoIXN0cmVhbS5lb2woKSkge1xuICAgICAgcmVhZFRva2VuKG1vZGUsIHN0cmVhbSwgc3RhdGUpO1xuICAgICAgc3RyZWFtLnN0YXJ0ID0gc3RyZWFtLnBvcztcbiAgICB9XG4gIH1cblxuICAvLyBDb252ZXJ0IGEgc3R5bGUgYXMgcmV0dXJuZWQgYnkgYSBtb2RlIChlaXRoZXIgbnVsbCwgb3IgYSBzdHJpbmdcbiAgLy8gY29udGFpbmluZyBvbmUgb3IgbW9yZSBzdHlsZXMpIHRvIGEgQ1NTIHN0eWxlLiBUaGlzIGlzIGNhY2hlZCxcbiAgLy8gYW5kIGFsc28gbG9va3MgZm9yIGxpbmUtd2lkZSBzdHlsZXMuXG4gIHZhciBzdHlsZVRvQ2xhc3NDYWNoZSA9IHt9LCBzdHlsZVRvQ2xhc3NDYWNoZVdpdGhNb2RlID0ge307XG4gIGZ1bmN0aW9uIGludGVycHJldFRva2VuU3R5bGUoc3R5bGUsIG9wdGlvbnMpIHtcbiAgICBpZiAoIXN0eWxlIHx8IC9eXFxzKiQvLnRlc3Qoc3R5bGUpKSByZXR1cm4gbnVsbDtcbiAgICB2YXIgY2FjaGUgPSBvcHRpb25zLmFkZE1vZGVDbGFzcyA/IHN0eWxlVG9DbGFzc0NhY2hlV2l0aE1vZGUgOiBzdHlsZVRvQ2xhc3NDYWNoZTtcbiAgICByZXR1cm4gY2FjaGVbc3R5bGVdIHx8XG4gICAgICAoY2FjaGVbc3R5bGVdID0gc3R5bGUucmVwbGFjZSgvXFxTKy9nLCBcImNtLSQmXCIpKTtcbiAgfVxuXG4gIC8vIFJlbmRlciB0aGUgRE9NIHJlcHJlc2VudGF0aW9uIG9mIHRoZSB0ZXh0IG9mIGEgbGluZS4gQWxzbyBidWlsZHNcbiAgLy8gdXAgYSAnbGluZSBtYXAnLCB3aGljaCBwb2ludHMgYXQgdGhlIERPTSBub2RlcyB0aGF0IHJlcHJlc2VudFxuICAvLyBzcGVjaWZpYyBzdHJldGNoZXMgb2YgdGV4dCwgYW5kIGlzIHVzZWQgYnkgdGhlIG1lYXN1cmluZyBjb2RlLlxuICAvLyBUaGUgcmV0dXJuZWQgb2JqZWN0IGNvbnRhaW5zIHRoZSBET00gbm9kZSwgdGhpcyBtYXAsIGFuZFxuICAvLyBpbmZvcm1hdGlvbiBhYm91dCBsaW5lLXdpZGUgc3R5bGVzIHRoYXQgd2VyZSBzZXQgYnkgdGhlIG1vZGUuXG4gIGZ1bmN0aW9uIGJ1aWxkTGluZUNvbnRlbnQoY20sIGxpbmVWaWV3KSB7XG4gICAgLy8gVGhlIHBhZGRpbmctcmlnaHQgZm9yY2VzIHRoZSBlbGVtZW50IHRvIGhhdmUgYSAnYm9yZGVyJywgd2hpY2hcbiAgICAvLyBpcyBuZWVkZWQgb24gV2Via2l0IHRvIGJlIGFibGUgdG8gZ2V0IGxpbmUtbGV2ZWwgYm91bmRpbmdcbiAgICAvLyByZWN0YW5nbGVzIGZvciBpdCAoaW4gbWVhc3VyZUNoYXIpLlxuICAgIHZhciBjb250ZW50ID0gZWx0KFwic3BhblwiLCBudWxsLCBudWxsLCB3ZWJraXQgPyBcInBhZGRpbmctcmlnaHQ6IC4xcHhcIiA6IG51bGwpO1xuICAgIHZhciBidWlsZGVyID0ge3ByZTogZWx0KFwicHJlXCIsIFtjb250ZW50XSwgXCJDb2RlTWlycm9yLWxpbmVcIiksIGNvbnRlbnQ6IGNvbnRlbnQsXG4gICAgICAgICAgICAgICAgICAgY29sOiAwLCBwb3M6IDAsIGNtOiBjbSxcbiAgICAgICAgICAgICAgICAgICBzcGxpdFNwYWNlczogKGllIHx8IHdlYmtpdCkgJiYgY20uZ2V0T3B0aW9uKFwibGluZVdyYXBwaW5nXCIpfTtcbiAgICBsaW5lVmlldy5tZWFzdXJlID0ge307XG5cbiAgICAvLyBJdGVyYXRlIG92ZXIgdGhlIGxvZ2ljYWwgbGluZXMgdGhhdCBtYWtlIHVwIHRoaXMgdmlzdWFsIGxpbmUuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPD0gKGxpbmVWaWV3LnJlc3QgPyBsaW5lVmlldy5yZXN0Lmxlbmd0aCA6IDApOyBpKyspIHtcbiAgICAgIHZhciBsaW5lID0gaSA/IGxpbmVWaWV3LnJlc3RbaSAtIDFdIDogbGluZVZpZXcubGluZSwgb3JkZXI7XG4gICAgICBidWlsZGVyLnBvcyA9IDA7XG4gICAgICBidWlsZGVyLmFkZFRva2VuID0gYnVpbGRUb2tlbjtcbiAgICAgIC8vIE9wdGlvbmFsbHkgd2lyZSBpbiBzb21lIGhhY2tzIGludG8gdGhlIHRva2VuLXJlbmRlcmluZ1xuICAgICAgLy8gYWxnb3JpdGhtLCB0byBkZWFsIHdpdGggYnJvd3NlciBxdWlya3MuXG4gICAgICBpZiAoaGFzQmFkQmlkaVJlY3RzKGNtLmRpc3BsYXkubWVhc3VyZSkgJiYgKG9yZGVyID0gZ2V0T3JkZXIobGluZSkpKVxuICAgICAgICBidWlsZGVyLmFkZFRva2VuID0gYnVpbGRUb2tlbkJhZEJpZGkoYnVpbGRlci5hZGRUb2tlbiwgb3JkZXIpO1xuICAgICAgYnVpbGRlci5tYXAgPSBbXTtcbiAgICAgIHZhciBhbGxvd0Zyb250aWVyVXBkYXRlID0gbGluZVZpZXcgIT0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkICYmIGxpbmVObyhsaW5lKTtcbiAgICAgIGluc2VydExpbmVDb250ZW50KGxpbmUsIGJ1aWxkZXIsIGdldExpbmVTdHlsZXMoY20sIGxpbmUsIGFsbG93RnJvbnRpZXJVcGRhdGUpKTtcbiAgICAgIGlmIChsaW5lLnN0eWxlQ2xhc3Nlcykge1xuICAgICAgICBpZiAobGluZS5zdHlsZUNsYXNzZXMuYmdDbGFzcylcbiAgICAgICAgICBidWlsZGVyLmJnQ2xhc3MgPSBqb2luQ2xhc3NlcyhsaW5lLnN0eWxlQ2xhc3Nlcy5iZ0NsYXNzLCBidWlsZGVyLmJnQ2xhc3MgfHwgXCJcIik7XG4gICAgICAgIGlmIChsaW5lLnN0eWxlQ2xhc3Nlcy50ZXh0Q2xhc3MpXG4gICAgICAgICAgYnVpbGRlci50ZXh0Q2xhc3MgPSBqb2luQ2xhc3NlcyhsaW5lLnN0eWxlQ2xhc3Nlcy50ZXh0Q2xhc3MsIGJ1aWxkZXIudGV4dENsYXNzIHx8IFwiXCIpO1xuICAgICAgfVxuXG4gICAgICAvLyBFbnN1cmUgYXQgbGVhc3QgYSBzaW5nbGUgbm9kZSBpcyBwcmVzZW50LCBmb3IgbWVhc3VyaW5nLlxuICAgICAgaWYgKGJ1aWxkZXIubWFwLmxlbmd0aCA9PSAwKVxuICAgICAgICBidWlsZGVyLm1hcC5wdXNoKDAsIDAsIGJ1aWxkZXIuY29udGVudC5hcHBlbmRDaGlsZCh6ZXJvV2lkdGhFbGVtZW50KGNtLmRpc3BsYXkubWVhc3VyZSkpKTtcblxuICAgICAgLy8gU3RvcmUgdGhlIG1hcCBhbmQgYSBjYWNoZSBvYmplY3QgZm9yIHRoZSBjdXJyZW50IGxvZ2ljYWwgbGluZVxuICAgICAgaWYgKGkgPT0gMCkge1xuICAgICAgICBsaW5lVmlldy5tZWFzdXJlLm1hcCA9IGJ1aWxkZXIubWFwO1xuICAgICAgICBsaW5lVmlldy5tZWFzdXJlLmNhY2hlID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAobGluZVZpZXcubWVhc3VyZS5tYXBzIHx8IChsaW5lVmlldy5tZWFzdXJlLm1hcHMgPSBbXSkpLnB1c2goYnVpbGRlci5tYXApO1xuICAgICAgICAobGluZVZpZXcubWVhc3VyZS5jYWNoZXMgfHwgKGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzID0gW10pKS5wdXNoKHt9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTZWUgaXNzdWUgIzI5MDFcbiAgICBpZiAod2Via2l0ICYmIC9cXGJjbS10YWJcXGIvLnRlc3QoYnVpbGRlci5jb250ZW50Lmxhc3RDaGlsZC5jbGFzc05hbWUpKVxuICAgICAgYnVpbGRlci5jb250ZW50LmNsYXNzTmFtZSA9IFwiY20tdGFiLXdyYXAtaGFja1wiO1xuXG4gICAgc2lnbmFsKGNtLCBcInJlbmRlckxpbmVcIiwgY20sIGxpbmVWaWV3LmxpbmUsIGJ1aWxkZXIucHJlKTtcbiAgICBpZiAoYnVpbGRlci5wcmUuY2xhc3NOYW1lKVxuICAgICAgYnVpbGRlci50ZXh0Q2xhc3MgPSBqb2luQ2xhc3NlcyhidWlsZGVyLnByZS5jbGFzc05hbWUsIGJ1aWxkZXIudGV4dENsYXNzIHx8IFwiXCIpO1xuXG4gICAgcmV0dXJuIGJ1aWxkZXI7XG4gIH1cblxuICBmdW5jdGlvbiBkZWZhdWx0U3BlY2lhbENoYXJQbGFjZWhvbGRlcihjaCkge1xuICAgIHZhciB0b2tlbiA9IGVsdChcInNwYW5cIiwgXCJcXHUyMDIyXCIsIFwiY20taW52YWxpZGNoYXJcIik7XG4gICAgdG9rZW4udGl0bGUgPSBcIlxcXFx1XCIgKyBjaC5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KTtcbiAgICB0b2tlbi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIHRva2VuLnRpdGxlKTtcbiAgICByZXR1cm4gdG9rZW47XG4gIH1cblxuICAvLyBCdWlsZCB1cCB0aGUgRE9NIHJlcHJlc2VudGF0aW9uIGZvciBhIHNpbmdsZSB0b2tlbiwgYW5kIGFkZCBpdCB0b1xuICAvLyB0aGUgbGluZSBtYXAuIFRha2VzIGNhcmUgdG8gcmVuZGVyIHNwZWNpYWwgY2hhcmFjdGVycyBzZXBhcmF0ZWx5LlxuICBmdW5jdGlvbiBidWlsZFRva2VuKGJ1aWxkZXIsIHRleHQsIHN0eWxlLCBzdGFydFN0eWxlLCBlbmRTdHlsZSwgdGl0bGUsIGNzcykge1xuICAgIGlmICghdGV4dCkgcmV0dXJuO1xuICAgIHZhciBkaXNwbGF5VGV4dCA9IGJ1aWxkZXIuc3BsaXRTcGFjZXMgPyB0ZXh0LnJlcGxhY2UoLyB7Myx9L2csIHNwbGl0U3BhY2VzKSA6IHRleHQ7XG4gICAgdmFyIHNwZWNpYWwgPSBidWlsZGVyLmNtLnN0YXRlLnNwZWNpYWxDaGFycywgbXVzdFdyYXAgPSBmYWxzZTtcbiAgICBpZiAoIXNwZWNpYWwudGVzdCh0ZXh0KSkge1xuICAgICAgYnVpbGRlci5jb2wgKz0gdGV4dC5sZW5ndGg7XG4gICAgICB2YXIgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGRpc3BsYXlUZXh0KTtcbiAgICAgIGJ1aWxkZXIubWFwLnB1c2goYnVpbGRlci5wb3MsIGJ1aWxkZXIucG9zICsgdGV4dC5sZW5ndGgsIGNvbnRlbnQpO1xuICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5KSBtdXN0V3JhcCA9IHRydWU7XG4gICAgICBidWlsZGVyLnBvcyArPSB0ZXh0Lmxlbmd0aDtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCksIHBvcyA9IDA7XG4gICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBzcGVjaWFsLmxhc3RJbmRleCA9IHBvcztcbiAgICAgICAgdmFyIG0gPSBzcGVjaWFsLmV4ZWModGV4dCk7XG4gICAgICAgIHZhciBza2lwcGVkID0gbSA/IG0uaW5kZXggLSBwb3MgOiB0ZXh0Lmxlbmd0aCAtIHBvcztcbiAgICAgICAgaWYgKHNraXBwZWQpIHtcbiAgICAgICAgICB2YXIgdHh0ID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoZGlzcGxheVRleHQuc2xpY2UocG9zLCBwb3MgKyBza2lwcGVkKSk7XG4gICAgICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5KSBjb250ZW50LmFwcGVuZENoaWxkKGVsdChcInNwYW5cIiwgW3R4dF0pKTtcbiAgICAgICAgICBlbHNlIGNvbnRlbnQuYXBwZW5kQ2hpbGQodHh0KTtcbiAgICAgICAgICBidWlsZGVyLm1hcC5wdXNoKGJ1aWxkZXIucG9zLCBidWlsZGVyLnBvcyArIHNraXBwZWQsIHR4dCk7XG4gICAgICAgICAgYnVpbGRlci5jb2wgKz0gc2tpcHBlZDtcbiAgICAgICAgICBidWlsZGVyLnBvcyArPSBza2lwcGVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICghbSkgYnJlYWs7XG4gICAgICAgIHBvcyArPSBza2lwcGVkICsgMTtcbiAgICAgICAgaWYgKG1bMF0gPT0gXCJcXHRcIikge1xuICAgICAgICAgIHZhciB0YWJTaXplID0gYnVpbGRlci5jbS5vcHRpb25zLnRhYlNpemUsIHRhYldpZHRoID0gdGFiU2l6ZSAtIGJ1aWxkZXIuY29sICUgdGFiU2l6ZTtcbiAgICAgICAgICB2YXIgdHh0ID0gY29udGVudC5hcHBlbmRDaGlsZChlbHQoXCJzcGFuXCIsIHNwYWNlU3RyKHRhYldpZHRoKSwgXCJjbS10YWJcIikpO1xuICAgICAgICAgIHR4dC5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwicHJlc2VudGF0aW9uXCIpO1xuICAgICAgICAgIHR4dC5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIFwiXFx0XCIpO1xuICAgICAgICAgIGJ1aWxkZXIuY29sICs9IHRhYldpZHRoO1xuICAgICAgICB9IGVsc2UgaWYgKG1bMF0gPT0gXCJcXHJcIiB8fCBtWzBdID09IFwiXFxuXCIpIHtcbiAgICAgICAgICB2YXIgdHh0ID0gY29udGVudC5hcHBlbmRDaGlsZChlbHQoXCJzcGFuXCIsIG1bMF0gPT0gXCJcXHJcIiA/IFwiXFx1MjQwZFwiIDogXCJcXHUyNDI0XCIsIFwiY20taW52YWxpZGNoYXJcIikpO1xuICAgICAgICAgIHR4dC5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIG1bMF0pO1xuICAgICAgICAgIGJ1aWxkZXIuY29sICs9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIHR4dCA9IGJ1aWxkZXIuY20ub3B0aW9ucy5zcGVjaWFsQ2hhclBsYWNlaG9sZGVyKG1bMF0pO1xuICAgICAgICAgIHR4dC5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIG1bMF0pO1xuICAgICAgICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSkgY29udGVudC5hcHBlbmRDaGlsZChlbHQoXCJzcGFuXCIsIFt0eHRdKSk7XG4gICAgICAgICAgZWxzZSBjb250ZW50LmFwcGVuZENoaWxkKHR4dCk7XG4gICAgICAgICAgYnVpbGRlci5jb2wgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICBidWlsZGVyLm1hcC5wdXNoKGJ1aWxkZXIucG9zLCBidWlsZGVyLnBvcyArIDEsIHR4dCk7XG4gICAgICAgIGJ1aWxkZXIucG9zKys7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChzdHlsZSB8fCBzdGFydFN0eWxlIHx8IGVuZFN0eWxlIHx8IG11c3RXcmFwIHx8IGNzcykge1xuICAgICAgdmFyIGZ1bGxTdHlsZSA9IHN0eWxlIHx8IFwiXCI7XG4gICAgICBpZiAoc3RhcnRTdHlsZSkgZnVsbFN0eWxlICs9IHN0YXJ0U3R5bGU7XG4gICAgICBpZiAoZW5kU3R5bGUpIGZ1bGxTdHlsZSArPSBlbmRTdHlsZTtcbiAgICAgIHZhciB0b2tlbiA9IGVsdChcInNwYW5cIiwgW2NvbnRlbnRdLCBmdWxsU3R5bGUsIGNzcyk7XG4gICAgICBpZiAodGl0bGUpIHRva2VuLnRpdGxlID0gdGl0bGU7XG4gICAgICByZXR1cm4gYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKHRva2VuKTtcbiAgICB9XG4gICAgYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKGNvbnRlbnQpO1xuICB9XG5cbiAgZnVuY3Rpb24gc3BsaXRTcGFjZXMob2xkKSB7XG4gICAgdmFyIG91dCA9IFwiIFwiO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb2xkLmxlbmd0aCAtIDI7ICsraSkgb3V0ICs9IGkgJSAyID8gXCIgXCIgOiBcIlxcdTAwYTBcIjtcbiAgICBvdXQgKz0gXCIgXCI7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIC8vIFdvcmsgYXJvdW5kIG5vbnNlbnNlIGRpbWVuc2lvbnMgYmVpbmcgcmVwb3J0ZWQgZm9yIHN0cmV0Y2hlcyBvZlxuICAvLyByaWdodC10by1sZWZ0IHRleHQuXG4gIGZ1bmN0aW9uIGJ1aWxkVG9rZW5CYWRCaWRpKGlubmVyLCBvcmRlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihidWlsZGVyLCB0ZXh0LCBzdHlsZSwgc3RhcnRTdHlsZSwgZW5kU3R5bGUsIHRpdGxlLCBjc3MpIHtcbiAgICAgIHN0eWxlID0gc3R5bGUgPyBzdHlsZSArIFwiIGNtLWZvcmNlLWJvcmRlclwiIDogXCJjbS1mb3JjZS1ib3JkZXJcIjtcbiAgICAgIHZhciBzdGFydCA9IGJ1aWxkZXIucG9zLCBlbmQgPSBzdGFydCArIHRleHQubGVuZ3RoO1xuICAgICAgZm9yICg7Oykge1xuICAgICAgICAvLyBGaW5kIHRoZSBwYXJ0IHRoYXQgb3ZlcmxhcHMgd2l0aCB0aGUgc3RhcnQgb2YgdGhpcyB0ZXh0XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb3JkZXIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICB2YXIgcGFydCA9IG9yZGVyW2ldO1xuICAgICAgICAgIGlmIChwYXJ0LnRvID4gc3RhcnQgJiYgcGFydC5mcm9tIDw9IHN0YXJ0KSBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBpZiAocGFydC50byA+PSBlbmQpIHJldHVybiBpbm5lcihidWlsZGVyLCB0ZXh0LCBzdHlsZSwgc3RhcnRTdHlsZSwgZW5kU3R5bGUsIHRpdGxlLCBjc3MpO1xuICAgICAgICBpbm5lcihidWlsZGVyLCB0ZXh0LnNsaWNlKDAsIHBhcnQudG8gLSBzdGFydCksIHN0eWxlLCBzdGFydFN0eWxlLCBudWxsLCB0aXRsZSwgY3NzKTtcbiAgICAgICAgc3RhcnRTdHlsZSA9IG51bGw7XG4gICAgICAgIHRleHQgPSB0ZXh0LnNsaWNlKHBhcnQudG8gLSBzdGFydCk7XG4gICAgICAgIHN0YXJ0ID0gcGFydC50bztcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gYnVpbGRDb2xsYXBzZWRTcGFuKGJ1aWxkZXIsIHNpemUsIG1hcmtlciwgaWdub3JlV2lkZ2V0KSB7XG4gICAgdmFyIHdpZGdldCA9ICFpZ25vcmVXaWRnZXQgJiYgbWFya2VyLndpZGdldE5vZGU7XG4gICAgaWYgKHdpZGdldCkgYnVpbGRlci5tYXAucHVzaChidWlsZGVyLnBvcywgYnVpbGRlci5wb3MgKyBzaXplLCB3aWRnZXQpO1xuICAgIGlmICghaWdub3JlV2lkZ2V0ICYmIGJ1aWxkZXIuY20uZGlzcGxheS5pbnB1dC5uZWVkc0NvbnRlbnRBdHRyaWJ1dGUpIHtcbiAgICAgIGlmICghd2lkZ2V0KVxuICAgICAgICB3aWRnZXQgPSBidWlsZGVyLmNvbnRlbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIikpO1xuICAgICAgd2lkZ2V0LnNldEF0dHJpYnV0ZShcImNtLW1hcmtlclwiLCBtYXJrZXIuaWQpO1xuICAgIH1cbiAgICBpZiAod2lkZ2V0KSB7XG4gICAgICBidWlsZGVyLmNtLmRpc3BsYXkuaW5wdXQuc2V0VW5lZGl0YWJsZSh3aWRnZXQpO1xuICAgICAgYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKHdpZGdldCk7XG4gICAgfVxuICAgIGJ1aWxkZXIucG9zICs9IHNpemU7XG4gIH1cblxuICAvLyBPdXRwdXRzIGEgbnVtYmVyIG9mIHNwYW5zIHRvIG1ha2UgdXAgYSBsaW5lLCB0YWtpbmcgaGlnaGxpZ2h0aW5nXG4gIC8vIGFuZCBtYXJrZWQgdGV4dCBpbnRvIGFjY291bnQuXG4gIGZ1bmN0aW9uIGluc2VydExpbmVDb250ZW50KGxpbmUsIGJ1aWxkZXIsIHN0eWxlcykge1xuICAgIHZhciBzcGFucyA9IGxpbmUubWFya2VkU3BhbnMsIGFsbFRleHQgPSBsaW5lLnRleHQsIGF0ID0gMDtcbiAgICBpZiAoIXNwYW5zKSB7XG4gICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHN0eWxlcy5sZW5ndGg7IGkrPTIpXG4gICAgICAgIGJ1aWxkZXIuYWRkVG9rZW4oYnVpbGRlciwgYWxsVGV4dC5zbGljZShhdCwgYXQgPSBzdHlsZXNbaV0pLCBpbnRlcnByZXRUb2tlblN0eWxlKHN0eWxlc1tpKzFdLCBidWlsZGVyLmNtLm9wdGlvbnMpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgbGVuID0gYWxsVGV4dC5sZW5ndGgsIHBvcyA9IDAsIGkgPSAxLCB0ZXh0ID0gXCJcIiwgc3R5bGUsIGNzcztcbiAgICB2YXIgbmV4dENoYW5nZSA9IDAsIHNwYW5TdHlsZSwgc3BhbkVuZFN0eWxlLCBzcGFuU3RhcnRTdHlsZSwgdGl0bGUsIGNvbGxhcHNlZDtcbiAgICBmb3IgKDs7KSB7XG4gICAgICBpZiAobmV4dENoYW5nZSA9PSBwb3MpIHsgLy8gVXBkYXRlIGN1cnJlbnQgbWFya2VyIHNldFxuICAgICAgICBzcGFuU3R5bGUgPSBzcGFuRW5kU3R5bGUgPSBzcGFuU3RhcnRTdHlsZSA9IHRpdGxlID0gY3NzID0gXCJcIjtcbiAgICAgICAgY29sbGFwc2VkID0gbnVsbDsgbmV4dENoYW5nZSA9IEluZmluaXR5O1xuICAgICAgICB2YXIgZm91bmRCb29rbWFya3MgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBzcGFucy5sZW5ndGg7ICsraikge1xuICAgICAgICAgIHZhciBzcCA9IHNwYW5zW2pdLCBtID0gc3AubWFya2VyO1xuICAgICAgICAgIGlmIChtLnR5cGUgPT0gXCJib29rbWFya1wiICYmIHNwLmZyb20gPT0gcG9zICYmIG0ud2lkZ2V0Tm9kZSkge1xuICAgICAgICAgICAgZm91bmRCb29rbWFya3MucHVzaChtKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHNwLmZyb20gPD0gcG9zICYmIChzcC50byA9PSBudWxsIHx8IHNwLnRvID4gcG9zIHx8IG0uY29sbGFwc2VkICYmIHNwLnRvID09IHBvcyAmJiBzcC5mcm9tID09IHBvcykpIHtcbiAgICAgICAgICAgIGlmIChzcC50byAhPSBudWxsICYmIHNwLnRvICE9IHBvcyAmJiBuZXh0Q2hhbmdlID4gc3AudG8pIHtcbiAgICAgICAgICAgICAgbmV4dENoYW5nZSA9IHNwLnRvO1xuICAgICAgICAgICAgICBzcGFuRW5kU3R5bGUgPSBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG0uY2xhc3NOYW1lKSBzcGFuU3R5bGUgKz0gXCIgXCIgKyBtLmNsYXNzTmFtZTtcbiAgICAgICAgICAgIGlmIChtLmNzcykgY3NzID0gKGNzcyA/IGNzcyArIFwiO1wiIDogXCJcIikgKyBtLmNzcztcbiAgICAgICAgICAgIGlmIChtLnN0YXJ0U3R5bGUgJiYgc3AuZnJvbSA9PSBwb3MpIHNwYW5TdGFydFN0eWxlICs9IFwiIFwiICsgbS5zdGFydFN0eWxlO1xuICAgICAgICAgICAgaWYgKG0uZW5kU3R5bGUgJiYgc3AudG8gPT0gbmV4dENoYW5nZSkgc3BhbkVuZFN0eWxlICs9IFwiIFwiICsgbS5lbmRTdHlsZTtcbiAgICAgICAgICAgIGlmIChtLnRpdGxlICYmICF0aXRsZSkgdGl0bGUgPSBtLnRpdGxlO1xuICAgICAgICAgICAgaWYgKG0uY29sbGFwc2VkICYmICghY29sbGFwc2VkIHx8IGNvbXBhcmVDb2xsYXBzZWRNYXJrZXJzKGNvbGxhcHNlZC5tYXJrZXIsIG0pIDwgMCkpXG4gICAgICAgICAgICAgIGNvbGxhcHNlZCA9IHNwO1xuICAgICAgICAgIH0gZWxzZSBpZiAoc3AuZnJvbSA+IHBvcyAmJiBuZXh0Q2hhbmdlID4gc3AuZnJvbSkge1xuICAgICAgICAgICAgbmV4dENoYW5nZSA9IHNwLmZyb207XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb2xsYXBzZWQgJiYgKGNvbGxhcHNlZC5mcm9tIHx8IDApID09IHBvcykge1xuICAgICAgICAgIGJ1aWxkQ29sbGFwc2VkU3BhbihidWlsZGVyLCAoY29sbGFwc2VkLnRvID09IG51bGwgPyBsZW4gKyAxIDogY29sbGFwc2VkLnRvKSAtIHBvcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sbGFwc2VkLm1hcmtlciwgY29sbGFwc2VkLmZyb20gPT0gbnVsbCk7XG4gICAgICAgICAgaWYgKGNvbGxhcHNlZC50byA9PSBudWxsKSByZXR1cm47XG4gICAgICAgICAgaWYgKGNvbGxhcHNlZC50byA9PSBwb3MpIGNvbGxhcHNlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICghY29sbGFwc2VkICYmIGZvdW5kQm9va21hcmtzLmxlbmd0aCkgZm9yICh2YXIgaiA9IDA7IGogPCBmb3VuZEJvb2ttYXJrcy5sZW5ndGg7ICsrailcbiAgICAgICAgICBidWlsZENvbGxhcHNlZFNwYW4oYnVpbGRlciwgMCwgZm91bmRCb29rbWFya3Nbal0pO1xuICAgICAgfVxuICAgICAgaWYgKHBvcyA+PSBsZW4pIGJyZWFrO1xuXG4gICAgICB2YXIgdXB0byA9IE1hdGgubWluKGxlbiwgbmV4dENoYW5nZSk7XG4gICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBpZiAodGV4dCkge1xuICAgICAgICAgIHZhciBlbmQgPSBwb3MgKyB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgICBpZiAoIWNvbGxhcHNlZCkge1xuICAgICAgICAgICAgdmFyIHRva2VuVGV4dCA9IGVuZCA+IHVwdG8gPyB0ZXh0LnNsaWNlKDAsIHVwdG8gLSBwb3MpIDogdGV4dDtcbiAgICAgICAgICAgIGJ1aWxkZXIuYWRkVG9rZW4oYnVpbGRlciwgdG9rZW5UZXh0LCBzdHlsZSA/IHN0eWxlICsgc3BhblN0eWxlIDogc3BhblN0eWxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGFuU3RhcnRTdHlsZSwgcG9zICsgdG9rZW5UZXh0Lmxlbmd0aCA9PSBuZXh0Q2hhbmdlID8gc3BhbkVuZFN0eWxlIDogXCJcIiwgdGl0bGUsIGNzcyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlbmQgPj0gdXB0bykge3RleHQgPSB0ZXh0LnNsaWNlKHVwdG8gLSBwb3MpOyBwb3MgPSB1cHRvOyBicmVhazt9XG4gICAgICAgICAgcG9zID0gZW5kO1xuICAgICAgICAgIHNwYW5TdGFydFN0eWxlID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICB0ZXh0ID0gYWxsVGV4dC5zbGljZShhdCwgYXQgPSBzdHlsZXNbaSsrXSk7XG4gICAgICAgIHN0eWxlID0gaW50ZXJwcmV0VG9rZW5TdHlsZShzdHlsZXNbaSsrXSwgYnVpbGRlci5jbS5vcHRpb25zKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBET0NVTUVOVCBEQVRBIFNUUlVDVFVSRVxuXG4gIC8vIEJ5IGRlZmF1bHQsIHVwZGF0ZXMgdGhhdCBzdGFydCBhbmQgZW5kIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gIC8vIGFyZSB0cmVhdGVkIHNwZWNpYWxseSwgaW4gb3JkZXIgdG8gbWFrZSB0aGUgYXNzb2NpYXRpb24gb2YgbGluZVxuICAvLyB3aWRnZXRzIGFuZCBtYXJrZXIgZWxlbWVudHMgd2l0aCB0aGUgdGV4dCBiZWhhdmUgbW9yZSBpbnR1aXRpdmUuXG4gIGZ1bmN0aW9uIGlzV2hvbGVMaW5lVXBkYXRlKGRvYywgY2hhbmdlKSB7XG4gICAgcmV0dXJuIGNoYW5nZS5mcm9tLmNoID09IDAgJiYgY2hhbmdlLnRvLmNoID09IDAgJiYgbHN0KGNoYW5nZS50ZXh0KSA9PSBcIlwiICYmXG4gICAgICAoIWRvYy5jbSB8fCBkb2MuY20ub3B0aW9ucy53aG9sZUxpbmVVcGRhdGVCZWZvcmUpO1xuICB9XG5cbiAgLy8gUGVyZm9ybSBhIGNoYW5nZSBvbiB0aGUgZG9jdW1lbnQgZGF0YSBzdHJ1Y3R1cmUuXG4gIGZ1bmN0aW9uIHVwZGF0ZURvYyhkb2MsIGNoYW5nZSwgbWFya2VkU3BhbnMsIGVzdGltYXRlSGVpZ2h0KSB7XG4gICAgZnVuY3Rpb24gc3BhbnNGb3Iobikge3JldHVybiBtYXJrZWRTcGFucyA/IG1hcmtlZFNwYW5zW25dIDogbnVsbDt9XG4gICAgZnVuY3Rpb24gdXBkYXRlKGxpbmUsIHRleHQsIHNwYW5zKSB7XG4gICAgICB1cGRhdGVMaW5lKGxpbmUsIHRleHQsIHNwYW5zLCBlc3RpbWF0ZUhlaWdodCk7XG4gICAgICBzaWduYWxMYXRlcihsaW5lLCBcImNoYW5nZVwiLCBsaW5lLCBjaGFuZ2UpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBsaW5lc0ZvcihzdGFydCwgZW5kKSB7XG4gICAgICBmb3IgKHZhciBpID0gc3RhcnQsIHJlc3VsdCA9IFtdOyBpIDwgZW5kOyArK2kpXG4gICAgICAgIHJlc3VsdC5wdXNoKG5ldyBMaW5lKHRleHRbaV0sIHNwYW5zRm9yKGkpLCBlc3RpbWF0ZUhlaWdodCkpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICB2YXIgZnJvbSA9IGNoYW5nZS5mcm9tLCB0byA9IGNoYW5nZS50bywgdGV4dCA9IGNoYW5nZS50ZXh0O1xuICAgIHZhciBmaXJzdExpbmUgPSBnZXRMaW5lKGRvYywgZnJvbS5saW5lKSwgbGFzdExpbmUgPSBnZXRMaW5lKGRvYywgdG8ubGluZSk7XG4gICAgdmFyIGxhc3RUZXh0ID0gbHN0KHRleHQpLCBsYXN0U3BhbnMgPSBzcGFuc0Zvcih0ZXh0Lmxlbmd0aCAtIDEpLCBubGluZXMgPSB0by5saW5lIC0gZnJvbS5saW5lO1xuXG4gICAgLy8gQWRqdXN0IHRoZSBsaW5lIHN0cnVjdHVyZVxuICAgIGlmIChjaGFuZ2UuZnVsbCkge1xuICAgICAgZG9jLmluc2VydCgwLCBsaW5lc0ZvcigwLCB0ZXh0Lmxlbmd0aCkpO1xuICAgICAgZG9jLnJlbW92ZSh0ZXh0Lmxlbmd0aCwgZG9jLnNpemUgLSB0ZXh0Lmxlbmd0aCk7XG4gICAgfSBlbHNlIGlmIChpc1dob2xlTGluZVVwZGF0ZShkb2MsIGNoYW5nZSkpIHtcbiAgICAgIC8vIFRoaXMgaXMgYSB3aG9sZS1saW5lIHJlcGxhY2UuIFRyZWF0ZWQgc3BlY2lhbGx5IHRvIG1ha2VcbiAgICAgIC8vIHN1cmUgbGluZSBvYmplY3RzIG1vdmUgdGhlIHdheSB0aGV5IGFyZSBzdXBwb3NlZCB0by5cbiAgICAgIHZhciBhZGRlZCA9IGxpbmVzRm9yKDAsIHRleHQubGVuZ3RoIC0gMSk7XG4gICAgICB1cGRhdGUobGFzdExpbmUsIGxhc3RMaW5lLnRleHQsIGxhc3RTcGFucyk7XG4gICAgICBpZiAobmxpbmVzKSBkb2MucmVtb3ZlKGZyb20ubGluZSwgbmxpbmVzKTtcbiAgICAgIGlmIChhZGRlZC5sZW5ndGgpIGRvYy5pbnNlcnQoZnJvbS5saW5lLCBhZGRlZCk7XG4gICAgfSBlbHNlIGlmIChmaXJzdExpbmUgPT0gbGFzdExpbmUpIHtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgbGFzdFRleHQgKyBmaXJzdExpbmUudGV4dC5zbGljZSh0by5jaCksIGxhc3RTcGFucyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgYWRkZWQgPSBsaW5lc0ZvcigxLCB0ZXh0Lmxlbmd0aCAtIDEpO1xuICAgICAgICBhZGRlZC5wdXNoKG5ldyBMaW5lKGxhc3RUZXh0ICsgZmlyc3RMaW5lLnRleHQuc2xpY2UodG8uY2gpLCBsYXN0U3BhbnMsIGVzdGltYXRlSGVpZ2h0KSk7XG4gICAgICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgdGV4dFswXSwgc3BhbnNGb3IoMCkpO1xuICAgICAgICBkb2MuaW5zZXJ0KGZyb20ubGluZSArIDEsIGFkZGVkKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRleHQubGVuZ3RoID09IDEpIHtcbiAgICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgdGV4dFswXSArIGxhc3RMaW5lLnRleHQuc2xpY2UodG8uY2gpLCBzcGFuc0ZvcigwKSk7XG4gICAgICBkb2MucmVtb3ZlKGZyb20ubGluZSArIDEsIG5saW5lcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgdGV4dFswXSwgc3BhbnNGb3IoMCkpO1xuICAgICAgdXBkYXRlKGxhc3RMaW5lLCBsYXN0VGV4dCArIGxhc3RMaW5lLnRleHQuc2xpY2UodG8uY2gpLCBsYXN0U3BhbnMpO1xuICAgICAgdmFyIGFkZGVkID0gbGluZXNGb3IoMSwgdGV4dC5sZW5ndGggLSAxKTtcbiAgICAgIGlmIChubGluZXMgPiAxKSBkb2MucmVtb3ZlKGZyb20ubGluZSArIDEsIG5saW5lcyAtIDEpO1xuICAgICAgZG9jLmluc2VydChmcm9tLmxpbmUgKyAxLCBhZGRlZCk7XG4gICAgfVxuXG4gICAgc2lnbmFsTGF0ZXIoZG9jLCBcImNoYW5nZVwiLCBkb2MsIGNoYW5nZSk7XG4gIH1cblxuICAvLyBUaGUgZG9jdW1lbnQgaXMgcmVwcmVzZW50ZWQgYXMgYSBCVHJlZSBjb25zaXN0aW5nIG9mIGxlYXZlcywgd2l0aFxuICAvLyBjaHVuayBvZiBsaW5lcyBpbiB0aGVtLCBhbmQgYnJhbmNoZXMsIHdpdGggdXAgdG8gdGVuIGxlYXZlcyBvclxuICAvLyBvdGhlciBicmFuY2ggbm9kZXMgYmVsb3cgdGhlbS4gVGhlIHRvcCBub2RlIGlzIGFsd2F5cyBhIGJyYW5jaFxuICAvLyBub2RlLCBhbmQgaXMgdGhlIGRvY3VtZW50IG9iamVjdCBpdHNlbGYgKG1lYW5pbmcgaXQgaGFzXG4gIC8vIGFkZGl0aW9uYWwgbWV0aG9kcyBhbmQgcHJvcGVydGllcykuXG4gIC8vXG4gIC8vIEFsbCBub2RlcyBoYXZlIHBhcmVudCBsaW5rcy4gVGhlIHRyZWUgaXMgdXNlZCBib3RoIHRvIGdvIGZyb21cbiAgLy8gbGluZSBudW1iZXJzIHRvIGxpbmUgb2JqZWN0cywgYW5kIHRvIGdvIGZyb20gb2JqZWN0cyB0byBudW1iZXJzLlxuICAvLyBJdCBhbHNvIGluZGV4ZXMgYnkgaGVpZ2h0LCBhbmQgaXMgdXNlZCB0byBjb252ZXJ0IGJldHdlZW4gaGVpZ2h0XG4gIC8vIGFuZCBsaW5lIG9iamVjdCwgYW5kIHRvIGZpbmQgdGhlIHRvdGFsIGhlaWdodCBvZiB0aGUgZG9jdW1lbnQuXG4gIC8vXG4gIC8vIFNlZSBhbHNvIGh0dHA6Ly9tYXJpam5oYXZlcmJla2UubmwvYmxvZy9jb2RlbWlycm9yLWxpbmUtdHJlZS5odG1sXG5cbiAgZnVuY3Rpb24gTGVhZkNodW5rKGxpbmVzKSB7XG4gICAgdGhpcy5saW5lcyA9IGxpbmVzO1xuICAgIHRoaXMucGFyZW50ID0gbnVsbDtcbiAgICBmb3IgKHZhciBpID0gMCwgaGVpZ2h0ID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICBsaW5lc1tpXS5wYXJlbnQgPSB0aGlzO1xuICAgICAgaGVpZ2h0ICs9IGxpbmVzW2ldLmhlaWdodDtcbiAgICB9XG4gICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gIH1cblxuICBMZWFmQ2h1bmsucHJvdG90eXBlID0ge1xuICAgIGNodW5rU2l6ZTogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmxpbmVzLmxlbmd0aDsgfSxcbiAgICAvLyBSZW1vdmUgdGhlIG4gbGluZXMgYXQgb2Zmc2V0ICdhdCcuXG4gICAgcmVtb3ZlSW5uZXI6IGZ1bmN0aW9uKGF0LCBuKSB7XG4gICAgICBmb3IgKHZhciBpID0gYXQsIGUgPSBhdCArIG47IGkgPCBlOyArK2kpIHtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmxpbmVzW2ldO1xuICAgICAgICB0aGlzLmhlaWdodCAtPSBsaW5lLmhlaWdodDtcbiAgICAgICAgY2xlYW5VcExpbmUobGluZSk7XG4gICAgICAgIHNpZ25hbExhdGVyKGxpbmUsIFwiZGVsZXRlXCIpO1xuICAgICAgfVxuICAgICAgdGhpcy5saW5lcy5zcGxpY2UoYXQsIG4pO1xuICAgIH0sXG4gICAgLy8gSGVscGVyIHVzZWQgdG8gY29sbGFwc2UgYSBzbWFsbCBicmFuY2ggaW50byBhIHNpbmdsZSBsZWFmLlxuICAgIGNvbGxhcHNlOiBmdW5jdGlvbihsaW5lcykge1xuICAgICAgbGluZXMucHVzaC5hcHBseShsaW5lcywgdGhpcy5saW5lcyk7XG4gICAgfSxcbiAgICAvLyBJbnNlcnQgdGhlIGdpdmVuIGFycmF5IG9mIGxpbmVzIGF0IG9mZnNldCAnYXQnLCBjb3VudCB0aGVtIGFzXG4gICAgLy8gaGF2aW5nIHRoZSBnaXZlbiBoZWlnaHQuXG4gICAgaW5zZXJ0SW5uZXI6IGZ1bmN0aW9uKGF0LCBsaW5lcywgaGVpZ2h0KSB7XG4gICAgICB0aGlzLmhlaWdodCArPSBoZWlnaHQ7XG4gICAgICB0aGlzLmxpbmVzID0gdGhpcy5saW5lcy5zbGljZSgwLCBhdCkuY29uY2F0KGxpbmVzKS5jb25jYXQodGhpcy5saW5lcy5zbGljZShhdCkpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7ICsraSkgbGluZXNbaV0ucGFyZW50ID0gdGhpcztcbiAgICB9LFxuICAgIC8vIFVzZWQgdG8gaXRlcmF0ZSBvdmVyIGEgcGFydCBvZiB0aGUgdHJlZS5cbiAgICBpdGVyTjogZnVuY3Rpb24oYXQsIG4sIG9wKSB7XG4gICAgICBmb3IgKHZhciBlID0gYXQgKyBuOyBhdCA8IGU7ICsrYXQpXG4gICAgICAgIGlmIChvcCh0aGlzLmxpbmVzW2F0XSkpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfTtcblxuICBmdW5jdGlvbiBCcmFuY2hDaHVuayhjaGlsZHJlbikge1xuICAgIHRoaXMuY2hpbGRyZW4gPSBjaGlsZHJlbjtcbiAgICB2YXIgc2l6ZSA9IDAsIGhlaWdodCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGNoID0gY2hpbGRyZW5baV07XG4gICAgICBzaXplICs9IGNoLmNodW5rU2l6ZSgpOyBoZWlnaHQgKz0gY2guaGVpZ2h0O1xuICAgICAgY2gucGFyZW50ID0gdGhpcztcbiAgICB9XG4gICAgdGhpcy5zaXplID0gc2l6ZTtcbiAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgICB0aGlzLnBhcmVudCA9IG51bGw7XG4gIH1cblxuICBCcmFuY2hDaHVuay5wcm90b3R5cGUgPSB7XG4gICAgY2h1bmtTaXplOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuc2l6ZTsgfSxcbiAgICByZW1vdmVJbm5lcjogZnVuY3Rpb24oYXQsIG4pIHtcbiAgICAgIHRoaXMuc2l6ZSAtPSBuO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV0sIHN6ID0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgICAgIGlmIChhdCA8IHN6KSB7XG4gICAgICAgICAgdmFyIHJtID0gTWF0aC5taW4obiwgc3ogLSBhdCksIG9sZEhlaWdodCA9IGNoaWxkLmhlaWdodDtcbiAgICAgICAgICBjaGlsZC5yZW1vdmVJbm5lcihhdCwgcm0pO1xuICAgICAgICAgIHRoaXMuaGVpZ2h0IC09IG9sZEhlaWdodCAtIGNoaWxkLmhlaWdodDtcbiAgICAgICAgICBpZiAoc3ogPT0gcm0pIHsgdGhpcy5jaGlsZHJlbi5zcGxpY2UoaS0tLCAxKTsgY2hpbGQucGFyZW50ID0gbnVsbDsgfVxuICAgICAgICAgIGlmICgobiAtPSBybSkgPT0gMCkgYnJlYWs7XG4gICAgICAgICAgYXQgPSAwO1xuICAgICAgICB9IGVsc2UgYXQgLT0gc3o7XG4gICAgICB9XG4gICAgICAvLyBJZiB0aGUgcmVzdWx0IGlzIHNtYWxsZXIgdGhhbiAyNSBsaW5lcywgZW5zdXJlIHRoYXQgaXQgaXMgYVxuICAgICAgLy8gc2luZ2xlIGxlYWYgbm9kZS5cbiAgICAgIGlmICh0aGlzLnNpemUgLSBuIDwgMjUgJiZcbiAgICAgICAgICAodGhpcy5jaGlsZHJlbi5sZW5ndGggPiAxIHx8ICEodGhpcy5jaGlsZHJlblswXSBpbnN0YW5jZW9mIExlYWZDaHVuaykpKSB7XG4gICAgICAgIHZhciBsaW5lcyA9IFtdO1xuICAgICAgICB0aGlzLmNvbGxhcHNlKGxpbmVzKTtcbiAgICAgICAgdGhpcy5jaGlsZHJlbiA9IFtuZXcgTGVhZkNodW5rKGxpbmVzKV07XG4gICAgICAgIHRoaXMuY2hpbGRyZW5bMF0ucGFyZW50ID0gdGhpcztcbiAgICAgIH1cbiAgICB9LFxuICAgIGNvbGxhcHNlOiBmdW5jdGlvbihsaW5lcykge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB0aGlzLmNoaWxkcmVuW2ldLmNvbGxhcHNlKGxpbmVzKTtcbiAgICB9LFxuICAgIGluc2VydElubmVyOiBmdW5jdGlvbihhdCwgbGluZXMsIGhlaWdodCkge1xuICAgICAgdGhpcy5zaXplICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgIHRoaXMuaGVpZ2h0ICs9IGhlaWdodDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldLCBzeiA9IGNoaWxkLmNodW5rU2l6ZSgpO1xuICAgICAgICBpZiAoYXQgPD0gc3opIHtcbiAgICAgICAgICBjaGlsZC5pbnNlcnRJbm5lcihhdCwgbGluZXMsIGhlaWdodCk7XG4gICAgICAgICAgaWYgKGNoaWxkLmxpbmVzICYmIGNoaWxkLmxpbmVzLmxlbmd0aCA+IDUwKSB7XG4gICAgICAgICAgICB3aGlsZSAoY2hpbGQubGluZXMubGVuZ3RoID4gNTApIHtcbiAgICAgICAgICAgICAgdmFyIHNwaWxsZWQgPSBjaGlsZC5saW5lcy5zcGxpY2UoY2hpbGQubGluZXMubGVuZ3RoIC0gMjUsIDI1KTtcbiAgICAgICAgICAgICAgdmFyIG5ld2xlYWYgPSBuZXcgTGVhZkNodW5rKHNwaWxsZWQpO1xuICAgICAgICAgICAgICBjaGlsZC5oZWlnaHQgLT0gbmV3bGVhZi5oZWlnaHQ7XG4gICAgICAgICAgICAgIHRoaXMuY2hpbGRyZW4uc3BsaWNlKGkgKyAxLCAwLCBuZXdsZWFmKTtcbiAgICAgICAgICAgICAgbmV3bGVhZi5wYXJlbnQgPSB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5tYXliZVNwaWxsKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGF0IC09IHN6O1xuICAgICAgfVxuICAgIH0sXG4gICAgLy8gV2hlbiBhIG5vZGUgaGFzIGdyb3duLCBjaGVjayB3aGV0aGVyIGl0IHNob3VsZCBiZSBzcGxpdC5cbiAgICBtYXliZVNwaWxsOiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA8PSAxMCkgcmV0dXJuO1xuICAgICAgdmFyIG1lID0gdGhpcztcbiAgICAgIGRvIHtcbiAgICAgICAgdmFyIHNwaWxsZWQgPSBtZS5jaGlsZHJlbi5zcGxpY2UobWUuY2hpbGRyZW4ubGVuZ3RoIC0gNSwgNSk7XG4gICAgICAgIHZhciBzaWJsaW5nID0gbmV3IEJyYW5jaENodW5rKHNwaWxsZWQpO1xuICAgICAgICBpZiAoIW1lLnBhcmVudCkgeyAvLyBCZWNvbWUgdGhlIHBhcmVudCBub2RlXG4gICAgICAgICAgdmFyIGNvcHkgPSBuZXcgQnJhbmNoQ2h1bmsobWUuY2hpbGRyZW4pO1xuICAgICAgICAgIGNvcHkucGFyZW50ID0gbWU7XG4gICAgICAgICAgbWUuY2hpbGRyZW4gPSBbY29weSwgc2libGluZ107XG4gICAgICAgICAgbWUgPSBjb3B5O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1lLnNpemUgLT0gc2libGluZy5zaXplO1xuICAgICAgICAgIG1lLmhlaWdodCAtPSBzaWJsaW5nLmhlaWdodDtcbiAgICAgICAgICB2YXIgbXlJbmRleCA9IGluZGV4T2YobWUucGFyZW50LmNoaWxkcmVuLCBtZSk7XG4gICAgICAgICAgbWUucGFyZW50LmNoaWxkcmVuLnNwbGljZShteUluZGV4ICsgMSwgMCwgc2libGluZyk7XG4gICAgICAgIH1cbiAgICAgICAgc2libGluZy5wYXJlbnQgPSBtZS5wYXJlbnQ7XG4gICAgICB9IHdoaWxlIChtZS5jaGlsZHJlbi5sZW5ndGggPiAxMCk7XG4gICAgICBtZS5wYXJlbnQubWF5YmVTcGlsbCgpO1xuICAgIH0sXG4gICAgaXRlck46IGZ1bmN0aW9uKGF0LCBuLCBvcCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV0sIHN6ID0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgICAgIGlmIChhdCA8IHN6KSB7XG4gICAgICAgICAgdmFyIHVzZWQgPSBNYXRoLm1pbihuLCBzeiAtIGF0KTtcbiAgICAgICAgICBpZiAoY2hpbGQuaXRlck4oYXQsIHVzZWQsIG9wKSkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgaWYgKChuIC09IHVzZWQpID09IDApIGJyZWFrO1xuICAgICAgICAgIGF0ID0gMDtcbiAgICAgICAgfSBlbHNlIGF0IC09IHN6O1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICB2YXIgbmV4dERvY0lkID0gMDtcbiAgdmFyIERvYyA9IENvZGVNaXJyb3IuRG9jID0gZnVuY3Rpb24odGV4dCwgbW9kZSwgZmlyc3RMaW5lLCBsaW5lU2VwKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIERvYykpIHJldHVybiBuZXcgRG9jKHRleHQsIG1vZGUsIGZpcnN0TGluZSwgbGluZVNlcCk7XG4gICAgaWYgKGZpcnN0TGluZSA9PSBudWxsKSBmaXJzdExpbmUgPSAwO1xuXG4gICAgQnJhbmNoQ2h1bmsuY2FsbCh0aGlzLCBbbmV3IExlYWZDaHVuayhbbmV3IExpbmUoXCJcIiwgbnVsbCldKV0pO1xuICAgIHRoaXMuZmlyc3QgPSBmaXJzdExpbmU7XG4gICAgdGhpcy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbExlZnQgPSAwO1xuICAgIHRoaXMuY2FudEVkaXQgPSBmYWxzZTtcbiAgICB0aGlzLmNsZWFuR2VuZXJhdGlvbiA9IDE7XG4gICAgdGhpcy5mcm9udGllciA9IGZpcnN0TGluZTtcbiAgICB2YXIgc3RhcnQgPSBQb3MoZmlyc3RMaW5lLCAwKTtcbiAgICB0aGlzLnNlbCA9IHNpbXBsZVNlbGVjdGlvbihzdGFydCk7XG4gICAgdGhpcy5oaXN0b3J5ID0gbmV3IEhpc3RvcnkobnVsbCk7XG4gICAgdGhpcy5pZCA9ICsrbmV4dERvY0lkO1xuICAgIHRoaXMubW9kZU9wdGlvbiA9IG1vZGU7XG4gICAgdGhpcy5saW5lU2VwID0gbGluZVNlcDtcbiAgICB0aGlzLmV4dGVuZCA9IGZhbHNlO1xuXG4gICAgaWYgKHR5cGVvZiB0ZXh0ID09IFwic3RyaW5nXCIpIHRleHQgPSB0aGlzLnNwbGl0TGluZXModGV4dCk7XG4gICAgdXBkYXRlRG9jKHRoaXMsIHtmcm9tOiBzdGFydCwgdG86IHN0YXJ0LCB0ZXh0OiB0ZXh0fSk7XG4gICAgc2V0U2VsZWN0aW9uKHRoaXMsIHNpbXBsZVNlbGVjdGlvbihzdGFydCksIHNlbF9kb250U2Nyb2xsKTtcbiAgfTtcblxuICBEb2MucHJvdG90eXBlID0gY3JlYXRlT2JqKEJyYW5jaENodW5rLnByb3RvdHlwZSwge1xuICAgIGNvbnN0cnVjdG9yOiBEb2MsXG4gICAgLy8gSXRlcmF0ZSBvdmVyIHRoZSBkb2N1bWVudC4gU3VwcG9ydHMgdHdvIGZvcm1zIC0tIHdpdGggb25seSBvbmVcbiAgICAvLyBhcmd1bWVudCwgaXQgY2FsbHMgdGhhdCBmb3IgZWFjaCBsaW5lIGluIHRoZSBkb2N1bWVudC4gV2l0aFxuICAgIC8vIHRocmVlLCBpdCBpdGVyYXRlcyBvdmVyIHRoZSByYW5nZSBnaXZlbiBieSB0aGUgZmlyc3QgdHdvICh3aXRoXG4gICAgLy8gdGhlIHNlY29uZCBiZWluZyBub24taW5jbHVzaXZlKS5cbiAgICBpdGVyOiBmdW5jdGlvbihmcm9tLCB0bywgb3ApIHtcbiAgICAgIGlmIChvcCkgdGhpcy5pdGVyTihmcm9tIC0gdGhpcy5maXJzdCwgdG8gLSBmcm9tLCBvcCk7XG4gICAgICBlbHNlIHRoaXMuaXRlck4odGhpcy5maXJzdCwgdGhpcy5maXJzdCArIHRoaXMuc2l6ZSwgZnJvbSk7XG4gICAgfSxcblxuICAgIC8vIE5vbi1wdWJsaWMgaW50ZXJmYWNlIGZvciBhZGRpbmcgYW5kIHJlbW92aW5nIGxpbmVzLlxuICAgIGluc2VydDogZnVuY3Rpb24oYXQsIGxpbmVzKSB7XG4gICAgICB2YXIgaGVpZ2h0ID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyArK2kpIGhlaWdodCArPSBsaW5lc1tpXS5oZWlnaHQ7XG4gICAgICB0aGlzLmluc2VydElubmVyKGF0IC0gdGhpcy5maXJzdCwgbGluZXMsIGhlaWdodCk7XG4gICAgfSxcbiAgICByZW1vdmU6IGZ1bmN0aW9uKGF0LCBuKSB7IHRoaXMucmVtb3ZlSW5uZXIoYXQgLSB0aGlzLmZpcnN0LCBuKTsgfSxcblxuICAgIC8vIEZyb20gaGVyZSwgdGhlIG1ldGhvZHMgYXJlIHBhcnQgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2UuIE1vc3RcbiAgICAvLyBhcmUgYWxzbyBhdmFpbGFibGUgZnJvbSBDb2RlTWlycm9yIChlZGl0b3IpIGluc3RhbmNlcy5cblxuICAgIGdldFZhbHVlOiBmdW5jdGlvbihsaW5lU2VwKSB7XG4gICAgICB2YXIgbGluZXMgPSBnZXRMaW5lcyh0aGlzLCB0aGlzLmZpcnN0LCB0aGlzLmZpcnN0ICsgdGhpcy5zaXplKTtcbiAgICAgIGlmIChsaW5lU2VwID09PSBmYWxzZSkgcmV0dXJuIGxpbmVzO1xuICAgICAgcmV0dXJuIGxpbmVzLmpvaW4obGluZVNlcCB8fCB0aGlzLmxpbmVTZXBhcmF0b3IoKSk7XG4gICAgfSxcbiAgICBzZXRWYWx1ZTogZG9jTWV0aG9kT3AoZnVuY3Rpb24oY29kZSkge1xuICAgICAgdmFyIHRvcCA9IFBvcyh0aGlzLmZpcnN0LCAwKSwgbGFzdCA9IHRoaXMuZmlyc3QgKyB0aGlzLnNpemUgLSAxO1xuICAgICAgbWFrZUNoYW5nZSh0aGlzLCB7ZnJvbTogdG9wLCB0bzogUG9zKGxhc3QsIGdldExpbmUodGhpcywgbGFzdCkudGV4dC5sZW5ndGgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogdGhpcy5zcGxpdExpbmVzKGNvZGUpLCBvcmlnaW46IFwic2V0VmFsdWVcIiwgZnVsbDogdHJ1ZX0sIHRydWUpO1xuICAgICAgc2V0U2VsZWN0aW9uKHRoaXMsIHNpbXBsZVNlbGVjdGlvbih0b3ApKTtcbiAgICB9KSxcbiAgICByZXBsYWNlUmFuZ2U6IGZ1bmN0aW9uKGNvZGUsIGZyb20sIHRvLCBvcmlnaW4pIHtcbiAgICAgIGZyb20gPSBjbGlwUG9zKHRoaXMsIGZyb20pO1xuICAgICAgdG8gPSB0byA/IGNsaXBQb3ModGhpcywgdG8pIDogZnJvbTtcbiAgICAgIHJlcGxhY2VSYW5nZSh0aGlzLCBjb2RlLCBmcm9tLCB0bywgb3JpZ2luKTtcbiAgICB9LFxuICAgIGdldFJhbmdlOiBmdW5jdGlvbihmcm9tLCB0bywgbGluZVNlcCkge1xuICAgICAgdmFyIGxpbmVzID0gZ2V0QmV0d2Vlbih0aGlzLCBjbGlwUG9zKHRoaXMsIGZyb20pLCBjbGlwUG9zKHRoaXMsIHRvKSk7XG4gICAgICBpZiAobGluZVNlcCA9PT0gZmFsc2UpIHJldHVybiBsaW5lcztcbiAgICAgIHJldHVybiBsaW5lcy5qb2luKGxpbmVTZXAgfHwgdGhpcy5saW5lU2VwYXJhdG9yKCkpO1xuICAgIH0sXG5cbiAgICBnZXRMaW5lOiBmdW5jdGlvbihsaW5lKSB7dmFyIGwgPSB0aGlzLmdldExpbmVIYW5kbGUobGluZSk7IHJldHVybiBsICYmIGwudGV4dDt9LFxuXG4gICAgZ2V0TGluZUhhbmRsZTogZnVuY3Rpb24obGluZSkge2lmIChpc0xpbmUodGhpcywgbGluZSkpIHJldHVybiBnZXRMaW5lKHRoaXMsIGxpbmUpO30sXG4gICAgZ2V0TGluZU51bWJlcjogZnVuY3Rpb24obGluZSkge3JldHVybiBsaW5lTm8obGluZSk7fSxcblxuICAgIGdldExpbmVIYW5kbGVWaXN1YWxTdGFydDogZnVuY3Rpb24obGluZSkge1xuICAgICAgaWYgKHR5cGVvZiBsaW5lID09IFwibnVtYmVyXCIpIGxpbmUgPSBnZXRMaW5lKHRoaXMsIGxpbmUpO1xuICAgICAgcmV0dXJuIHZpc3VhbExpbmUobGluZSk7XG4gICAgfSxcblxuICAgIGxpbmVDb3VudDogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuc2l6ZTt9LFxuICAgIGZpcnN0TGluZTogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuZmlyc3Q7fSxcbiAgICBsYXN0TGluZTogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuZmlyc3QgKyB0aGlzLnNpemUgLSAxO30sXG5cbiAgICBjbGlwUG9zOiBmdW5jdGlvbihwb3MpIHtyZXR1cm4gY2xpcFBvcyh0aGlzLCBwb3MpO30sXG5cbiAgICBnZXRDdXJzb3I6IGZ1bmN0aW9uKHN0YXJ0KSB7XG4gICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbC5wcmltYXJ5KCksIHBvcztcbiAgICAgIGlmIChzdGFydCA9PSBudWxsIHx8IHN0YXJ0ID09IFwiaGVhZFwiKSBwb3MgPSByYW5nZS5oZWFkO1xuICAgICAgZWxzZSBpZiAoc3RhcnQgPT0gXCJhbmNob3JcIikgcG9zID0gcmFuZ2UuYW5jaG9yO1xuICAgICAgZWxzZSBpZiAoc3RhcnQgPT0gXCJlbmRcIiB8fCBzdGFydCA9PSBcInRvXCIgfHwgc3RhcnQgPT09IGZhbHNlKSBwb3MgPSByYW5nZS50bygpO1xuICAgICAgZWxzZSBwb3MgPSByYW5nZS5mcm9tKCk7XG4gICAgICByZXR1cm4gcG9zO1xuICAgIH0sXG4gICAgbGlzdFNlbGVjdGlvbnM6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5zZWwucmFuZ2VzOyB9LFxuICAgIHNvbWV0aGluZ1NlbGVjdGVkOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5zZWwuc29tZXRoaW5nU2VsZWN0ZWQoKTt9LFxuXG4gICAgc2V0Q3Vyc29yOiBkb2NNZXRob2RPcChmdW5jdGlvbihsaW5lLCBjaCwgb3B0aW9ucykge1xuICAgICAgc2V0U2ltcGxlU2VsZWN0aW9uKHRoaXMsIGNsaXBQb3ModGhpcywgdHlwZW9mIGxpbmUgPT0gXCJudW1iZXJcIiA/IFBvcyhsaW5lLCBjaCB8fCAwKSA6IGxpbmUpLCBudWxsLCBvcHRpb25zKTtcbiAgICB9KSxcbiAgICBzZXRTZWxlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGFuY2hvciwgaGVhZCwgb3B0aW9ucykge1xuICAgICAgc2V0U2ltcGxlU2VsZWN0aW9uKHRoaXMsIGNsaXBQb3ModGhpcywgYW5jaG9yKSwgY2xpcFBvcyh0aGlzLCBoZWFkIHx8IGFuY2hvciksIG9wdGlvbnMpO1xuICAgIH0pLFxuICAgIGV4dGVuZFNlbGVjdGlvbjogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGVhZCwgb3RoZXIsIG9wdGlvbnMpIHtcbiAgICAgIGV4dGVuZFNlbGVjdGlvbih0aGlzLCBjbGlwUG9zKHRoaXMsIGhlYWQpLCBvdGhlciAmJiBjbGlwUG9zKHRoaXMsIG90aGVyKSwgb3B0aW9ucyk7XG4gICAgfSksXG4gICAgZXh0ZW5kU2VsZWN0aW9uczogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGVhZHMsIG9wdGlvbnMpIHtcbiAgICAgIGV4dGVuZFNlbGVjdGlvbnModGhpcywgY2xpcFBvc0FycmF5KHRoaXMsIGhlYWRzLCBvcHRpb25zKSk7XG4gICAgfSksXG4gICAgZXh0ZW5kU2VsZWN0aW9uc0J5OiBkb2NNZXRob2RPcChmdW5jdGlvbihmLCBvcHRpb25zKSB7XG4gICAgICBleHRlbmRTZWxlY3Rpb25zKHRoaXMsIG1hcCh0aGlzLnNlbC5yYW5nZXMsIGYpLCBvcHRpb25zKTtcbiAgICB9KSxcbiAgICBzZXRTZWxlY3Rpb25zOiBkb2NNZXRob2RPcChmdW5jdGlvbihyYW5nZXMsIHByaW1hcnksIG9wdGlvbnMpIHtcbiAgICAgIGlmICghcmFuZ2VzLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIG91dCA9IFtdOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgICAgICBvdXRbaV0gPSBuZXcgUmFuZ2UoY2xpcFBvcyh0aGlzLCByYW5nZXNbaV0uYW5jaG9yKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsaXBQb3ModGhpcywgcmFuZ2VzW2ldLmhlYWQpKTtcbiAgICAgIGlmIChwcmltYXJ5ID09IG51bGwpIHByaW1hcnkgPSBNYXRoLm1pbihyYW5nZXMubGVuZ3RoIC0gMSwgdGhpcy5zZWwucHJpbUluZGV4KTtcbiAgICAgIHNldFNlbGVjdGlvbih0aGlzLCBub3JtYWxpemVTZWxlY3Rpb24ob3V0LCBwcmltYXJ5KSwgb3B0aW9ucyk7XG4gICAgfSksXG4gICAgYWRkU2VsZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbihhbmNob3IsIGhlYWQsIG9wdGlvbnMpIHtcbiAgICAgIHZhciByYW5nZXMgPSB0aGlzLnNlbC5yYW5nZXMuc2xpY2UoMCk7XG4gICAgICByYW5nZXMucHVzaChuZXcgUmFuZ2UoY2xpcFBvcyh0aGlzLCBhbmNob3IpLCBjbGlwUG9zKHRoaXMsIGhlYWQgfHwgYW5jaG9yKSkpO1xuICAgICAgc2V0U2VsZWN0aW9uKHRoaXMsIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMsIHJhbmdlcy5sZW5ndGggLSAxKSwgb3B0aW9ucyk7XG4gICAgfSksXG5cbiAgICBnZXRTZWxlY3Rpb246IGZ1bmN0aW9uKGxpbmVTZXApIHtcbiAgICAgIHZhciByYW5nZXMgPSB0aGlzLnNlbC5yYW5nZXMsIGxpbmVzO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHNlbCA9IGdldEJldHdlZW4odGhpcywgcmFuZ2VzW2ldLmZyb20oKSwgcmFuZ2VzW2ldLnRvKCkpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzID8gbGluZXMuY29uY2F0KHNlbCkgOiBzZWw7XG4gICAgICB9XG4gICAgICBpZiAobGluZVNlcCA9PT0gZmFsc2UpIHJldHVybiBsaW5lcztcbiAgICAgIGVsc2UgcmV0dXJuIGxpbmVzLmpvaW4obGluZVNlcCB8fCB0aGlzLmxpbmVTZXBhcmF0b3IoKSk7XG4gICAgfSxcbiAgICBnZXRTZWxlY3Rpb25zOiBmdW5jdGlvbihsaW5lU2VwKSB7XG4gICAgICB2YXIgcGFydHMgPSBbXSwgcmFuZ2VzID0gdGhpcy5zZWwucmFuZ2VzO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHNlbCA9IGdldEJldHdlZW4odGhpcywgcmFuZ2VzW2ldLmZyb20oKSwgcmFuZ2VzW2ldLnRvKCkpO1xuICAgICAgICBpZiAobGluZVNlcCAhPT0gZmFsc2UpIHNlbCA9IHNlbC5qb2luKGxpbmVTZXAgfHwgdGhpcy5saW5lU2VwYXJhdG9yKCkpO1xuICAgICAgICBwYXJ0c1tpXSA9IHNlbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBwYXJ0cztcbiAgICB9LFxuICAgIHJlcGxhY2VTZWxlY3Rpb246IGZ1bmN0aW9uKGNvZGUsIGNvbGxhcHNlLCBvcmlnaW4pIHtcbiAgICAgIHZhciBkdXAgPSBbXTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgICAgICBkdXBbaV0gPSBjb2RlO1xuICAgICAgdGhpcy5yZXBsYWNlU2VsZWN0aW9ucyhkdXAsIGNvbGxhcHNlLCBvcmlnaW4gfHwgXCIraW5wdXRcIik7XG4gICAgfSxcbiAgICByZXBsYWNlU2VsZWN0aW9uczogZG9jTWV0aG9kT3AoZnVuY3Rpb24oY29kZSwgY29sbGFwc2UsIG9yaWdpbikge1xuICAgICAgdmFyIGNoYW5nZXMgPSBbXSwgc2VsID0gdGhpcy5zZWw7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJhbmdlID0gc2VsLnJhbmdlc1tpXTtcbiAgICAgICAgY2hhbmdlc1tpXSA9IHtmcm9tOiByYW5nZS5mcm9tKCksIHRvOiByYW5nZS50bygpLCB0ZXh0OiB0aGlzLnNwbGl0TGluZXMoY29kZVtpXSksIG9yaWdpbjogb3JpZ2lufTtcbiAgICAgIH1cbiAgICAgIHZhciBuZXdTZWwgPSBjb2xsYXBzZSAmJiBjb2xsYXBzZSAhPSBcImVuZFwiICYmIGNvbXB1dGVSZXBsYWNlZFNlbCh0aGlzLCBjaGFuZ2VzLCBjb2xsYXBzZSk7XG4gICAgICBmb3IgKHZhciBpID0gY2hhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSlcbiAgICAgICAgbWFrZUNoYW5nZSh0aGlzLCBjaGFuZ2VzW2ldKTtcbiAgICAgIGlmIChuZXdTZWwpIHNldFNlbGVjdGlvblJlcGxhY2VIaXN0b3J5KHRoaXMsIG5ld1NlbCk7XG4gICAgICBlbHNlIGlmICh0aGlzLmNtKSBlbnN1cmVDdXJzb3JWaXNpYmxlKHRoaXMuY20pO1xuICAgIH0pLFxuICAgIHVuZG86IGRvY01ldGhvZE9wKGZ1bmN0aW9uKCkge21ha2VDaGFuZ2VGcm9tSGlzdG9yeSh0aGlzLCBcInVuZG9cIik7fSksXG4gICAgcmVkbzogZG9jTWV0aG9kT3AoZnVuY3Rpb24oKSB7bWFrZUNoYW5nZUZyb21IaXN0b3J5KHRoaXMsIFwicmVkb1wiKTt9KSxcbiAgICB1bmRvU2VsZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbigpIHttYWtlQ2hhbmdlRnJvbUhpc3RvcnkodGhpcywgXCJ1bmRvXCIsIHRydWUpO30pLFxuICAgIHJlZG9TZWxlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uKCkge21ha2VDaGFuZ2VGcm9tSGlzdG9yeSh0aGlzLCBcInJlZG9cIiwgdHJ1ZSk7fSksXG5cbiAgICBzZXRFeHRlbmRpbmc6IGZ1bmN0aW9uKHZhbCkge3RoaXMuZXh0ZW5kID0gdmFsO30sXG4gICAgZ2V0RXh0ZW5kaW5nOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5leHRlbmQ7fSxcblxuICAgIGhpc3RvcnlTaXplOiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBoaXN0ID0gdGhpcy5oaXN0b3J5LCBkb25lID0gMCwgdW5kb25lID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGlzdC5kb25lLmxlbmd0aDsgaSsrKSBpZiAoIWhpc3QuZG9uZVtpXS5yYW5nZXMpICsrZG9uZTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGlzdC51bmRvbmUubGVuZ3RoOyBpKyspIGlmICghaGlzdC51bmRvbmVbaV0ucmFuZ2VzKSArK3VuZG9uZTtcbiAgICAgIHJldHVybiB7dW5kbzogZG9uZSwgcmVkbzogdW5kb25lfTtcbiAgICB9LFxuICAgIGNsZWFySGlzdG9yeTogZnVuY3Rpb24oKSB7dGhpcy5oaXN0b3J5ID0gbmV3IEhpc3RvcnkodGhpcy5oaXN0b3J5Lm1heEdlbmVyYXRpb24pO30sXG5cbiAgICBtYXJrQ2xlYW46IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5jbGVhbkdlbmVyYXRpb24gPSB0aGlzLmNoYW5nZUdlbmVyYXRpb24odHJ1ZSk7XG4gICAgfSxcbiAgICBjaGFuZ2VHZW5lcmF0aW9uOiBmdW5jdGlvbihmb3JjZVNwbGl0KSB7XG4gICAgICBpZiAoZm9yY2VTcGxpdClcbiAgICAgICAgdGhpcy5oaXN0b3J5Lmxhc3RPcCA9IHRoaXMuaGlzdG9yeS5sYXN0U2VsT3AgPSB0aGlzLmhpc3RvcnkubGFzdE9yaWdpbiA9IG51bGw7XG4gICAgICByZXR1cm4gdGhpcy5oaXN0b3J5LmdlbmVyYXRpb247XG4gICAgfSxcbiAgICBpc0NsZWFuOiBmdW5jdGlvbiAoZ2VuKSB7XG4gICAgICByZXR1cm4gdGhpcy5oaXN0b3J5LmdlbmVyYXRpb24gPT0gKGdlbiB8fCB0aGlzLmNsZWFuR2VuZXJhdGlvbik7XG4gICAgfSxcblxuICAgIGdldEhpc3Rvcnk6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHtkb25lOiBjb3B5SGlzdG9yeUFycmF5KHRoaXMuaGlzdG9yeS5kb25lKSxcbiAgICAgICAgICAgICAgdW5kb25lOiBjb3B5SGlzdG9yeUFycmF5KHRoaXMuaGlzdG9yeS51bmRvbmUpfTtcbiAgICB9LFxuICAgIHNldEhpc3Rvcnk6IGZ1bmN0aW9uKGhpc3REYXRhKSB7XG4gICAgICB2YXIgaGlzdCA9IHRoaXMuaGlzdG9yeSA9IG5ldyBIaXN0b3J5KHRoaXMuaGlzdG9yeS5tYXhHZW5lcmF0aW9uKTtcbiAgICAgIGhpc3QuZG9uZSA9IGNvcHlIaXN0b3J5QXJyYXkoaGlzdERhdGEuZG9uZS5zbGljZSgwKSwgbnVsbCwgdHJ1ZSk7XG4gICAgICBoaXN0LnVuZG9uZSA9IGNvcHlIaXN0b3J5QXJyYXkoaGlzdERhdGEudW5kb25lLnNsaWNlKDApLCBudWxsLCB0cnVlKTtcbiAgICB9LFxuXG4gICAgYWRkTGluZUNsYXNzOiBkb2NNZXRob2RPcChmdW5jdGlvbihoYW5kbGUsIHdoZXJlLCBjbHMpIHtcbiAgICAgIHJldHVybiBjaGFuZ2VMaW5lKHRoaXMsIGhhbmRsZSwgd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyXCIgOiBcImNsYXNzXCIsIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgdmFyIHByb3AgPSB3aGVyZSA9PSBcInRleHRcIiA/IFwidGV4dENsYXNzXCJcbiAgICAgICAgICAgICAgICAgOiB3aGVyZSA9PSBcImJhY2tncm91bmRcIiA/IFwiYmdDbGFzc1wiXG4gICAgICAgICAgICAgICAgIDogd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyQ2xhc3NcIiA6IFwid3JhcENsYXNzXCI7XG4gICAgICAgIGlmICghbGluZVtwcm9wXSkgbGluZVtwcm9wXSA9IGNscztcbiAgICAgICAgZWxzZSBpZiAoY2xhc3NUZXN0KGNscykudGVzdChsaW5lW3Byb3BdKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBlbHNlIGxpbmVbcHJvcF0gKz0gXCIgXCIgKyBjbHM7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSk7XG4gICAgfSksXG4gICAgcmVtb3ZlTGluZUNsYXNzOiBkb2NNZXRob2RPcChmdW5jdGlvbihoYW5kbGUsIHdoZXJlLCBjbHMpIHtcbiAgICAgIHJldHVybiBjaGFuZ2VMaW5lKHRoaXMsIGhhbmRsZSwgd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyXCIgOiBcImNsYXNzXCIsIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgdmFyIHByb3AgPSB3aGVyZSA9PSBcInRleHRcIiA/IFwidGV4dENsYXNzXCJcbiAgICAgICAgICAgICAgICAgOiB3aGVyZSA9PSBcImJhY2tncm91bmRcIiA/IFwiYmdDbGFzc1wiXG4gICAgICAgICAgICAgICAgIDogd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyQ2xhc3NcIiA6IFwid3JhcENsYXNzXCI7XG4gICAgICAgIHZhciBjdXIgPSBsaW5lW3Byb3BdO1xuICAgICAgICBpZiAoIWN1cikgcmV0dXJuIGZhbHNlO1xuICAgICAgICBlbHNlIGlmIChjbHMgPT0gbnVsbCkgbGluZVtwcm9wXSA9IG51bGw7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIHZhciBmb3VuZCA9IGN1ci5tYXRjaChjbGFzc1Rlc3QoY2xzKSk7XG4gICAgICAgICAgaWYgKCFmb3VuZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIHZhciBlbmQgPSBmb3VuZC5pbmRleCArIGZvdW5kWzBdLmxlbmd0aDtcbiAgICAgICAgICBsaW5lW3Byb3BdID0gY3VyLnNsaWNlKDAsIGZvdW5kLmluZGV4KSArICghZm91bmQuaW5kZXggfHwgZW5kID09IGN1ci5sZW5ndGggPyBcIlwiIDogXCIgXCIpICsgY3VyLnNsaWNlKGVuZCkgfHwgbnVsbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0pO1xuICAgIH0pLFxuXG4gICAgYWRkTGluZVdpZGdldDogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGFuZGxlLCBub2RlLCBvcHRpb25zKSB7XG4gICAgICByZXR1cm4gYWRkTGluZVdpZGdldCh0aGlzLCBoYW5kbGUsIG5vZGUsIG9wdGlvbnMpO1xuICAgIH0pLFxuICAgIHJlbW92ZUxpbmVXaWRnZXQ6IGZ1bmN0aW9uKHdpZGdldCkgeyB3aWRnZXQuY2xlYXIoKTsgfSxcblxuICAgIG1hcmtUZXh0OiBmdW5jdGlvbihmcm9tLCB0bywgb3B0aW9ucykge1xuICAgICAgcmV0dXJuIG1hcmtUZXh0KHRoaXMsIGNsaXBQb3ModGhpcywgZnJvbSksIGNsaXBQb3ModGhpcywgdG8pLCBvcHRpb25zLCBvcHRpb25zICYmIG9wdGlvbnMudHlwZSB8fCBcInJhbmdlXCIpO1xuICAgIH0sXG4gICAgc2V0Qm9va21hcms6IGZ1bmN0aW9uKHBvcywgb3B0aW9ucykge1xuICAgICAgdmFyIHJlYWxPcHRzID0ge3JlcGxhY2VkV2l0aDogb3B0aW9ucyAmJiAob3B0aW9ucy5ub2RlVHlwZSA9PSBudWxsID8gb3B0aW9ucy53aWRnZXQgOiBvcHRpb25zKSxcbiAgICAgICAgICAgICAgICAgICAgICBpbnNlcnRMZWZ0OiBvcHRpb25zICYmIG9wdGlvbnMuaW5zZXJ0TGVmdCxcbiAgICAgICAgICAgICAgICAgICAgICBjbGVhcldoZW5FbXB0eTogZmFsc2UsIHNoYXJlZDogb3B0aW9ucyAmJiBvcHRpb25zLnNoYXJlZCxcbiAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVNb3VzZUV2ZW50czogb3B0aW9ucyAmJiBvcHRpb25zLmhhbmRsZU1vdXNlRXZlbnRzfTtcbiAgICAgIHBvcyA9IGNsaXBQb3ModGhpcywgcG9zKTtcbiAgICAgIHJldHVybiBtYXJrVGV4dCh0aGlzLCBwb3MsIHBvcywgcmVhbE9wdHMsIFwiYm9va21hcmtcIik7XG4gICAgfSxcbiAgICBmaW5kTWFya3NBdDogZnVuY3Rpb24ocG9zKSB7XG4gICAgICBwb3MgPSBjbGlwUG9zKHRoaXMsIHBvcyk7XG4gICAgICB2YXIgbWFya2VycyA9IFtdLCBzcGFucyA9IGdldExpbmUodGhpcywgcG9zLmxpbmUpLm1hcmtlZFNwYW5zO1xuICAgICAgaWYgKHNwYW5zKSBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBzcGFuID0gc3BhbnNbaV07XG4gICAgICAgIGlmICgoc3Bhbi5mcm9tID09IG51bGwgfHwgc3Bhbi5mcm9tIDw9IHBvcy5jaCkgJiZcbiAgICAgICAgICAgIChzcGFuLnRvID09IG51bGwgfHwgc3Bhbi50byA+PSBwb3MuY2gpKVxuICAgICAgICAgIG1hcmtlcnMucHVzaChzcGFuLm1hcmtlci5wYXJlbnQgfHwgc3Bhbi5tYXJrZXIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1hcmtlcnM7XG4gICAgfSxcbiAgICBmaW5kTWFya3M6IGZ1bmN0aW9uKGZyb20sIHRvLCBmaWx0ZXIpIHtcbiAgICAgIGZyb20gPSBjbGlwUG9zKHRoaXMsIGZyb20pOyB0byA9IGNsaXBQb3ModGhpcywgdG8pO1xuICAgICAgdmFyIGZvdW5kID0gW10sIGxpbmVObyA9IGZyb20ubGluZTtcbiAgICAgIHRoaXMuaXRlcihmcm9tLmxpbmUsIHRvLmxpbmUgKyAxLCBmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgIHZhciBzcGFucyA9IGxpbmUubWFya2VkU3BhbnM7XG4gICAgICAgIGlmIChzcGFucykgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIHZhciBzcGFuID0gc3BhbnNbaV07XG4gICAgICAgICAgaWYgKCEobGluZU5vID09IGZyb20ubGluZSAmJiBmcm9tLmNoID4gc3Bhbi50byB8fFxuICAgICAgICAgICAgICAgIHNwYW4uZnJvbSA9PSBudWxsICYmIGxpbmVObyAhPSBmcm9tLmxpbmV8fFxuICAgICAgICAgICAgICAgIGxpbmVObyA9PSB0by5saW5lICYmIHNwYW4uZnJvbSA+IHRvLmNoKSAmJlxuICAgICAgICAgICAgICAoIWZpbHRlciB8fCBmaWx0ZXIoc3Bhbi5tYXJrZXIpKSlcbiAgICAgICAgICAgIGZvdW5kLnB1c2goc3Bhbi5tYXJrZXIucGFyZW50IHx8IHNwYW4ubWFya2VyKTtcbiAgICAgICAgfVxuICAgICAgICArK2xpbmVObztcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIGZvdW5kO1xuICAgIH0sXG4gICAgZ2V0QWxsTWFya3M6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG1hcmtlcnMgPSBbXTtcbiAgICAgIHRoaXMuaXRlcihmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgIHZhciBzcHMgPSBsaW5lLm1hcmtlZFNwYW5zO1xuICAgICAgICBpZiAoc3BzKSBmb3IgKHZhciBpID0gMDsgaSA8IHNwcy5sZW5ndGg7ICsraSlcbiAgICAgICAgICBpZiAoc3BzW2ldLmZyb20gIT0gbnVsbCkgbWFya2Vycy5wdXNoKHNwc1tpXS5tYXJrZXIpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gbWFya2VycztcbiAgICB9LFxuXG4gICAgcG9zRnJvbUluZGV4OiBmdW5jdGlvbihvZmYpIHtcbiAgICAgIHZhciBjaCwgbGluZU5vID0gdGhpcy5maXJzdDtcbiAgICAgIHRoaXMuaXRlcihmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgIHZhciBzeiA9IGxpbmUudGV4dC5sZW5ndGggKyAxO1xuICAgICAgICBpZiAoc3ogPiBvZmYpIHsgY2ggPSBvZmY7IHJldHVybiB0cnVlOyB9XG4gICAgICAgIG9mZiAtPSBzejtcbiAgICAgICAgKytsaW5lTm87XG4gICAgICB9KTtcbiAgICAgIHJldHVybiBjbGlwUG9zKHRoaXMsIFBvcyhsaW5lTm8sIGNoKSk7XG4gICAgfSxcbiAgICBpbmRleEZyb21Qb3M6IGZ1bmN0aW9uIChjb29yZHMpIHtcbiAgICAgIGNvb3JkcyA9IGNsaXBQb3ModGhpcywgY29vcmRzKTtcbiAgICAgIHZhciBpbmRleCA9IGNvb3Jkcy5jaDtcbiAgICAgIGlmIChjb29yZHMubGluZSA8IHRoaXMuZmlyc3QgfHwgY29vcmRzLmNoIDwgMCkgcmV0dXJuIDA7XG4gICAgICB0aGlzLml0ZXIodGhpcy5maXJzdCwgY29vcmRzLmxpbmUsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgIGluZGV4ICs9IGxpbmUudGV4dC5sZW5ndGggKyAxO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gaW5kZXg7XG4gICAgfSxcblxuICAgIGNvcHk6IGZ1bmN0aW9uKGNvcHlIaXN0b3J5KSB7XG4gICAgICB2YXIgZG9jID0gbmV3IERvYyhnZXRMaW5lcyh0aGlzLCB0aGlzLmZpcnN0LCB0aGlzLmZpcnN0ICsgdGhpcy5zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubW9kZU9wdGlvbiwgdGhpcy5maXJzdCwgdGhpcy5saW5lU2VwKTtcbiAgICAgIGRvYy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcDsgZG9jLnNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgICBkb2Muc2VsID0gdGhpcy5zZWw7XG4gICAgICBkb2MuZXh0ZW5kID0gZmFsc2U7XG4gICAgICBpZiAoY29weUhpc3RvcnkpIHtcbiAgICAgICAgZG9jLmhpc3RvcnkudW5kb0RlcHRoID0gdGhpcy5oaXN0b3J5LnVuZG9EZXB0aDtcbiAgICAgICAgZG9jLnNldEhpc3RvcnkodGhpcy5nZXRIaXN0b3J5KCkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGRvYztcbiAgICB9LFxuXG4gICAgbGlua2VkRG9jOiBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICBpZiAoIW9wdGlvbnMpIG9wdGlvbnMgPSB7fTtcbiAgICAgIHZhciBmcm9tID0gdGhpcy5maXJzdCwgdG8gPSB0aGlzLmZpcnN0ICsgdGhpcy5zaXplO1xuICAgICAgaWYgKG9wdGlvbnMuZnJvbSAhPSBudWxsICYmIG9wdGlvbnMuZnJvbSA+IGZyb20pIGZyb20gPSBvcHRpb25zLmZyb207XG4gICAgICBpZiAob3B0aW9ucy50byAhPSBudWxsICYmIG9wdGlvbnMudG8gPCB0bykgdG8gPSBvcHRpb25zLnRvO1xuICAgICAgdmFyIGNvcHkgPSBuZXcgRG9jKGdldExpbmVzKHRoaXMsIGZyb20sIHRvKSwgb3B0aW9ucy5tb2RlIHx8IHRoaXMubW9kZU9wdGlvbiwgZnJvbSwgdGhpcy5saW5lU2VwKTtcbiAgICAgIGlmIChvcHRpb25zLnNoYXJlZEhpc3QpIGNvcHkuaGlzdG9yeSA9IHRoaXMuaGlzdG9yeTtcbiAgICAgICh0aGlzLmxpbmtlZCB8fCAodGhpcy5saW5rZWQgPSBbXSkpLnB1c2goe2RvYzogY29weSwgc2hhcmVkSGlzdDogb3B0aW9ucy5zaGFyZWRIaXN0fSk7XG4gICAgICBjb3B5LmxpbmtlZCA9IFt7ZG9jOiB0aGlzLCBpc1BhcmVudDogdHJ1ZSwgc2hhcmVkSGlzdDogb3B0aW9ucy5zaGFyZWRIaXN0fV07XG4gICAgICBjb3B5U2hhcmVkTWFya2Vycyhjb3B5LCBmaW5kU2hhcmVkTWFya2Vycyh0aGlzKSk7XG4gICAgICByZXR1cm4gY29weTtcbiAgICB9LFxuICAgIHVubGlua0RvYzogZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgIGlmIChvdGhlciBpbnN0YW5jZW9mIENvZGVNaXJyb3IpIG90aGVyID0gb3RoZXIuZG9jO1xuICAgICAgaWYgKHRoaXMubGlua2VkKSBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGlua2VkLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBsaW5rID0gdGhpcy5saW5rZWRbaV07XG4gICAgICAgIGlmIChsaW5rLmRvYyAhPSBvdGhlcikgY29udGludWU7XG4gICAgICAgIHRoaXMubGlua2VkLnNwbGljZShpLCAxKTtcbiAgICAgICAgb3RoZXIudW5saW5rRG9jKHRoaXMpO1xuICAgICAgICBkZXRhY2hTaGFyZWRNYXJrZXJzKGZpbmRTaGFyZWRNYXJrZXJzKHRoaXMpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICAvLyBJZiB0aGUgaGlzdG9yaWVzIHdlcmUgc2hhcmVkLCBzcGxpdCB0aGVtIGFnYWluXG4gICAgICBpZiAob3RoZXIuaGlzdG9yeSA9PSB0aGlzLmhpc3RvcnkpIHtcbiAgICAgICAgdmFyIHNwbGl0SWRzID0gW290aGVyLmlkXTtcbiAgICAgICAgbGlua2VkRG9jcyhvdGhlciwgZnVuY3Rpb24oZG9jKSB7c3BsaXRJZHMucHVzaChkb2MuaWQpO30sIHRydWUpO1xuICAgICAgICBvdGhlci5oaXN0b3J5ID0gbmV3IEhpc3RvcnkobnVsbCk7XG4gICAgICAgIG90aGVyLmhpc3RvcnkuZG9uZSA9IGNvcHlIaXN0b3J5QXJyYXkodGhpcy5oaXN0b3J5LmRvbmUsIHNwbGl0SWRzKTtcbiAgICAgICAgb3RoZXIuaGlzdG9yeS51bmRvbmUgPSBjb3B5SGlzdG9yeUFycmF5KHRoaXMuaGlzdG9yeS51bmRvbmUsIHNwbGl0SWRzKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGl0ZXJMaW5rZWREb2NzOiBmdW5jdGlvbihmKSB7bGlua2VkRG9jcyh0aGlzLCBmKTt9LFxuXG4gICAgZ2V0TW9kZTogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMubW9kZTt9LFxuICAgIGdldEVkaXRvcjogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuY207fSxcblxuICAgIHNwbGl0TGluZXM6IGZ1bmN0aW9uKHN0cikge1xuICAgICAgaWYgKHRoaXMubGluZVNlcCkgcmV0dXJuIHN0ci5zcGxpdCh0aGlzLmxpbmVTZXApO1xuICAgICAgcmV0dXJuIHNwbGl0TGluZXNBdXRvKHN0cik7XG4gICAgfSxcbiAgICBsaW5lU2VwYXJhdG9yOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMubGluZVNlcCB8fCBcIlxcblwiOyB9XG4gIH0pO1xuXG4gIC8vIFB1YmxpYyBhbGlhcy5cbiAgRG9jLnByb3RvdHlwZS5lYWNoTGluZSA9IERvYy5wcm90b3R5cGUuaXRlcjtcblxuICAvLyBTZXQgdXAgbWV0aG9kcyBvbiBDb2RlTWlycm9yJ3MgcHJvdG90eXBlIHRvIHJlZGlyZWN0IHRvIHRoZSBlZGl0b3IncyBkb2N1bWVudC5cbiAgdmFyIGRvbnREZWxlZ2F0ZSA9IFwiaXRlciBpbnNlcnQgcmVtb3ZlIGNvcHkgZ2V0RWRpdG9yIGNvbnN0cnVjdG9yXCIuc3BsaXQoXCIgXCIpO1xuICBmb3IgKHZhciBwcm9wIGluIERvYy5wcm90b3R5cGUpIGlmIChEb2MucHJvdG90eXBlLmhhc093blByb3BlcnR5KHByb3ApICYmIGluZGV4T2YoZG9udERlbGVnYXRlLCBwcm9wKSA8IDApXG4gICAgQ29kZU1pcnJvci5wcm90b3R5cGVbcHJvcF0gPSAoZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7cmV0dXJuIG1ldGhvZC5hcHBseSh0aGlzLmRvYywgYXJndW1lbnRzKTt9O1xuICAgIH0pKERvYy5wcm90b3R5cGVbcHJvcF0pO1xuXG4gIGV2ZW50TWl4aW4oRG9jKTtcblxuICAvLyBDYWxsIGYgZm9yIGFsbCBsaW5rZWQgZG9jdW1lbnRzLlxuICBmdW5jdGlvbiBsaW5rZWREb2NzKGRvYywgZiwgc2hhcmVkSGlzdE9ubHkpIHtcbiAgICBmdW5jdGlvbiBwcm9wYWdhdGUoZG9jLCBza2lwLCBzaGFyZWRIaXN0KSB7XG4gICAgICBpZiAoZG9jLmxpbmtlZCkgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2MubGlua2VkLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciByZWwgPSBkb2MubGlua2VkW2ldO1xuICAgICAgICBpZiAocmVsLmRvYyA9PSBza2lwKSBjb250aW51ZTtcbiAgICAgICAgdmFyIHNoYXJlZCA9IHNoYXJlZEhpc3QgJiYgcmVsLnNoYXJlZEhpc3Q7XG4gICAgICAgIGlmIChzaGFyZWRIaXN0T25seSAmJiAhc2hhcmVkKSBjb250aW51ZTtcbiAgICAgICAgZihyZWwuZG9jLCBzaGFyZWQpO1xuICAgICAgICBwcm9wYWdhdGUocmVsLmRvYywgZG9jLCBzaGFyZWQpO1xuICAgICAgfVxuICAgIH1cbiAgICBwcm9wYWdhdGUoZG9jLCBudWxsLCB0cnVlKTtcbiAgfVxuXG4gIC8vIEF0dGFjaCBhIGRvY3VtZW50IHRvIGFuIGVkaXRvci5cbiAgZnVuY3Rpb24gYXR0YWNoRG9jKGNtLCBkb2MpIHtcbiAgICBpZiAoZG9jLmNtKSB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIGRvY3VtZW50IGlzIGFscmVhZHkgaW4gdXNlLlwiKTtcbiAgICBjbS5kb2MgPSBkb2M7XG4gICAgZG9jLmNtID0gY207XG4gICAgZXN0aW1hdGVMaW5lSGVpZ2h0cyhjbSk7XG4gICAgbG9hZE1vZGUoY20pO1xuICAgIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIGZpbmRNYXhMaW5lKGNtKTtcbiAgICBjbS5vcHRpb25zLm1vZGUgPSBkb2MubW9kZU9wdGlvbjtcbiAgICByZWdDaGFuZ2UoY20pO1xuICB9XG5cbiAgLy8gTElORSBVVElMSVRJRVNcblxuICAvLyBGaW5kIHRoZSBsaW5lIG9iamVjdCBjb3JyZXNwb25kaW5nIHRvIHRoZSBnaXZlbiBsaW5lIG51bWJlci5cbiAgZnVuY3Rpb24gZ2V0TGluZShkb2MsIG4pIHtcbiAgICBuIC09IGRvYy5maXJzdDtcbiAgICBpZiAobiA8IDAgfHwgbiA+PSBkb2Muc2l6ZSkgdGhyb3cgbmV3IEVycm9yKFwiVGhlcmUgaXMgbm8gbGluZSBcIiArIChuICsgZG9jLmZpcnN0KSArIFwiIGluIHRoZSBkb2N1bWVudC5cIik7XG4gICAgZm9yICh2YXIgY2h1bmsgPSBkb2M7ICFjaHVuay5saW5lczspIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOzsgKytpKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IGNodW5rLmNoaWxkcmVuW2ldLCBzeiA9IGNoaWxkLmNodW5rU2l6ZSgpO1xuICAgICAgICBpZiAobiA8IHN6KSB7IGNodW5rID0gY2hpbGQ7IGJyZWFrOyB9XG4gICAgICAgIG4gLT0gc3o7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjaHVuay5saW5lc1tuXTtcbiAgfVxuXG4gIC8vIEdldCB0aGUgcGFydCBvZiBhIGRvY3VtZW50IGJldHdlZW4gdHdvIHBvc2l0aW9ucywgYXMgYW4gYXJyYXkgb2ZcbiAgLy8gc3RyaW5ncy5cbiAgZnVuY3Rpb24gZ2V0QmV0d2Vlbihkb2MsIHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgb3V0ID0gW10sIG4gPSBzdGFydC5saW5lO1xuICAgIGRvYy5pdGVyKHN0YXJ0LmxpbmUsIGVuZC5saW5lICsgMSwgZnVuY3Rpb24obGluZSkge1xuICAgICAgdmFyIHRleHQgPSBsaW5lLnRleHQ7XG4gICAgICBpZiAobiA9PSBlbmQubGluZSkgdGV4dCA9IHRleHQuc2xpY2UoMCwgZW5kLmNoKTtcbiAgICAgIGlmIChuID09IHN0YXJ0LmxpbmUpIHRleHQgPSB0ZXh0LnNsaWNlKHN0YXJ0LmNoKTtcbiAgICAgIG91dC5wdXNoKHRleHQpO1xuICAgICAgKytuO1xuICAgIH0pO1xuICAgIHJldHVybiBvdXQ7XG4gIH1cbiAgLy8gR2V0IHRoZSBsaW5lcyBiZXR3ZWVuIGZyb20gYW5kIHRvLCBhcyBhcnJheSBvZiBzdHJpbmdzLlxuICBmdW5jdGlvbiBnZXRMaW5lcyhkb2MsIGZyb20sIHRvKSB7XG4gICAgdmFyIG91dCA9IFtdO1xuICAgIGRvYy5pdGVyKGZyb20sIHRvLCBmdW5jdGlvbihsaW5lKSB7IG91dC5wdXNoKGxpbmUudGV4dCk7IH0pO1xuICAgIHJldHVybiBvdXQ7XG4gIH1cblxuICAvLyBVcGRhdGUgdGhlIGhlaWdodCBvZiBhIGxpbmUsIHByb3BhZ2F0aW5nIHRoZSBoZWlnaHQgY2hhbmdlXG4gIC8vIHVwd2FyZHMgdG8gcGFyZW50IG5vZGVzLlxuICBmdW5jdGlvbiB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGhlaWdodCkge1xuICAgIHZhciBkaWZmID0gaGVpZ2h0IC0gbGluZS5oZWlnaHQ7XG4gICAgaWYgKGRpZmYpIGZvciAodmFyIG4gPSBsaW5lOyBuOyBuID0gbi5wYXJlbnQpIG4uaGVpZ2h0ICs9IGRpZmY7XG4gIH1cblxuICAvLyBHaXZlbiBhIGxpbmUgb2JqZWN0LCBmaW5kIGl0cyBsaW5lIG51bWJlciBieSB3YWxraW5nIHVwIHRocm91Z2hcbiAgLy8gaXRzIHBhcmVudCBsaW5rcy5cbiAgZnVuY3Rpb24gbGluZU5vKGxpbmUpIHtcbiAgICBpZiAobGluZS5wYXJlbnQgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgdmFyIGN1ciA9IGxpbmUucGFyZW50LCBubyA9IGluZGV4T2YoY3VyLmxpbmVzLCBsaW5lKTtcbiAgICBmb3IgKHZhciBjaHVuayA9IGN1ci5wYXJlbnQ7IGNodW5rOyBjdXIgPSBjaHVuaywgY2h1bmsgPSBjaHVuay5wYXJlbnQpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOzsgKytpKSB7XG4gICAgICAgIGlmIChjaHVuay5jaGlsZHJlbltpXSA9PSBjdXIpIGJyZWFrO1xuICAgICAgICBubyArPSBjaHVuay5jaGlsZHJlbltpXS5jaHVua1NpemUoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5vICsgY3VyLmZpcnN0O1xuICB9XG5cbiAgLy8gRmluZCB0aGUgbGluZSBhdCB0aGUgZ2l2ZW4gdmVydGljYWwgcG9zaXRpb24sIHVzaW5nIHRoZSBoZWlnaHRcbiAgLy8gaW5mb3JtYXRpb24gaW4gdGhlIGRvY3VtZW50IHRyZWUuXG4gIGZ1bmN0aW9uIGxpbmVBdEhlaWdodChjaHVuaywgaCkge1xuICAgIHZhciBuID0gY2h1bmsuZmlyc3Q7XG4gICAgb3V0ZXI6IGRvIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmsuY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGNoaWxkID0gY2h1bmsuY2hpbGRyZW5baV0sIGNoID0gY2hpbGQuaGVpZ2h0O1xuICAgICAgICBpZiAoaCA8IGNoKSB7IGNodW5rID0gY2hpbGQ7IGNvbnRpbnVlIG91dGVyOyB9XG4gICAgICAgIGggLT0gY2g7XG4gICAgICAgIG4gKz0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbjtcbiAgICB9IHdoaWxlICghY2h1bmsubGluZXMpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmsubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBsaW5lID0gY2h1bmsubGluZXNbaV0sIGxoID0gbGluZS5oZWlnaHQ7XG4gICAgICBpZiAoaCA8IGxoKSBicmVhaztcbiAgICAgIGggLT0gbGg7XG4gICAgfVxuICAgIHJldHVybiBuICsgaTtcbiAgfVxuXG5cbiAgLy8gRmluZCB0aGUgaGVpZ2h0IGFib3ZlIHRoZSBnaXZlbiBsaW5lLlxuICBmdW5jdGlvbiBoZWlnaHRBdExpbmUobGluZU9iaikge1xuICAgIGxpbmVPYmogPSB2aXN1YWxMaW5lKGxpbmVPYmopO1xuXG4gICAgdmFyIGggPSAwLCBjaHVuayA9IGxpbmVPYmoucGFyZW50O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmsubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBsaW5lID0gY2h1bmsubGluZXNbaV07XG4gICAgICBpZiAobGluZSA9PSBsaW5lT2JqKSBicmVhaztcbiAgICAgIGVsc2UgaCArPSBsaW5lLmhlaWdodDtcbiAgICB9XG4gICAgZm9yICh2YXIgcCA9IGNodW5rLnBhcmVudDsgcDsgY2h1bmsgPSBwLCBwID0gY2h1bmsucGFyZW50KSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAuY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGN1ciA9IHAuY2hpbGRyZW5baV07XG4gICAgICAgIGlmIChjdXIgPT0gY2h1bmspIGJyZWFrO1xuICAgICAgICBlbHNlIGggKz0gY3VyLmhlaWdodDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGg7XG4gIH1cblxuICAvLyBHZXQgdGhlIGJpZGkgb3JkZXJpbmcgZm9yIHRoZSBnaXZlbiBsaW5lIChhbmQgY2FjaGUgaXQpLiBSZXR1cm5zXG4gIC8vIGZhbHNlIGZvciBsaW5lcyB0aGF0IGFyZSBmdWxseSBsZWZ0LXRvLXJpZ2h0LCBhbmQgYW4gYXJyYXkgb2ZcbiAgLy8gQmlkaVNwYW4gb2JqZWN0cyBvdGhlcndpc2UuXG4gIGZ1bmN0aW9uIGdldE9yZGVyKGxpbmUpIHtcbiAgICB2YXIgb3JkZXIgPSBsaW5lLm9yZGVyO1xuICAgIGlmIChvcmRlciA9PSBudWxsKSBvcmRlciA9IGxpbmUub3JkZXIgPSBiaWRpT3JkZXJpbmcobGluZS50ZXh0KTtcbiAgICByZXR1cm4gb3JkZXI7XG4gIH1cblxuICAvLyBISVNUT1JZXG5cbiAgZnVuY3Rpb24gSGlzdG9yeShzdGFydEdlbikge1xuICAgIC8vIEFycmF5cyBvZiBjaGFuZ2UgZXZlbnRzIGFuZCBzZWxlY3Rpb25zLiBEb2luZyBzb21ldGhpbmcgYWRkcyBhblxuICAgIC8vIGV2ZW50IHRvIGRvbmUgYW5kIGNsZWFycyB1bmRvLiBVbmRvaW5nIG1vdmVzIGV2ZW50cyBmcm9tIGRvbmVcbiAgICAvLyB0byB1bmRvbmUsIHJlZG9pbmcgbW92ZXMgdGhlbSBpbiB0aGUgb3RoZXIgZGlyZWN0aW9uLlxuICAgIHRoaXMuZG9uZSA9IFtdOyB0aGlzLnVuZG9uZSA9IFtdO1xuICAgIHRoaXMudW5kb0RlcHRoID0gSW5maW5pdHk7XG4gICAgLy8gVXNlZCB0byB0cmFjayB3aGVuIGNoYW5nZXMgY2FuIGJlIG1lcmdlZCBpbnRvIGEgc2luZ2xlIHVuZG9cbiAgICAvLyBldmVudFxuICAgIHRoaXMubGFzdE1vZFRpbWUgPSB0aGlzLmxhc3RTZWxUaW1lID0gMDtcbiAgICB0aGlzLmxhc3RPcCA9IHRoaXMubGFzdFNlbE9wID0gbnVsbDtcbiAgICB0aGlzLmxhc3RPcmlnaW4gPSB0aGlzLmxhc3RTZWxPcmlnaW4gPSBudWxsO1xuICAgIC8vIFVzZWQgYnkgdGhlIGlzQ2xlYW4oKSBtZXRob2RcbiAgICB0aGlzLmdlbmVyYXRpb24gPSB0aGlzLm1heEdlbmVyYXRpb24gPSBzdGFydEdlbiB8fCAxO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgaGlzdG9yeSBjaGFuZ2UgZXZlbnQgZnJvbSBhbiB1cGRhdGVEb2Mtc3R5bGUgY2hhbmdlXG4gIC8vIG9iamVjdC5cbiAgZnVuY3Rpb24gaGlzdG9yeUNoYW5nZUZyb21DaGFuZ2UoZG9jLCBjaGFuZ2UpIHtcbiAgICB2YXIgaGlzdENoYW5nZSA9IHtmcm9tOiBjb3B5UG9zKGNoYW5nZS5mcm9tKSwgdG86IGNoYW5nZUVuZChjaGFuZ2UpLCB0ZXh0OiBnZXRCZXR3ZWVuKGRvYywgY2hhbmdlLmZyb20sIGNoYW5nZS50byl9O1xuICAgIGF0dGFjaExvY2FsU3BhbnMoZG9jLCBoaXN0Q2hhbmdlLCBjaGFuZ2UuZnJvbS5saW5lLCBjaGFuZ2UudG8ubGluZSArIDEpO1xuICAgIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbihkb2MpIHthdHRhY2hMb2NhbFNwYW5zKGRvYywgaGlzdENoYW5nZSwgY2hhbmdlLmZyb20ubGluZSwgY2hhbmdlLnRvLmxpbmUgKyAxKTt9LCB0cnVlKTtcbiAgICByZXR1cm4gaGlzdENoYW5nZTtcbiAgfVxuXG4gIC8vIFBvcCBhbGwgc2VsZWN0aW9uIGV2ZW50cyBvZmYgdGhlIGVuZCBvZiBhIGhpc3RvcnkgYXJyYXkuIFN0b3AgYXRcbiAgLy8gYSBjaGFuZ2UgZXZlbnQuXG4gIGZ1bmN0aW9uIGNsZWFyU2VsZWN0aW9uRXZlbnRzKGFycmF5KSB7XG4gICAgd2hpbGUgKGFycmF5Lmxlbmd0aCkge1xuICAgICAgdmFyIGxhc3QgPSBsc3QoYXJyYXkpO1xuICAgICAgaWYgKGxhc3QucmFuZ2VzKSBhcnJheS5wb3AoKTtcbiAgICAgIGVsc2UgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgdG9wIGNoYW5nZSBldmVudCBpbiB0aGUgaGlzdG9yeS4gUG9wIG9mZiBzZWxlY3Rpb25cbiAgLy8gZXZlbnRzIHRoYXQgYXJlIGluIHRoZSB3YXkuXG4gIGZ1bmN0aW9uIGxhc3RDaGFuZ2VFdmVudChoaXN0LCBmb3JjZSkge1xuICAgIGlmIChmb3JjZSkge1xuICAgICAgY2xlYXJTZWxlY3Rpb25FdmVudHMoaGlzdC5kb25lKTtcbiAgICAgIHJldHVybiBsc3QoaGlzdC5kb25lKTtcbiAgICB9IGVsc2UgaWYgKGhpc3QuZG9uZS5sZW5ndGggJiYgIWxzdChoaXN0LmRvbmUpLnJhbmdlcykge1xuICAgICAgcmV0dXJuIGxzdChoaXN0LmRvbmUpO1xuICAgIH0gZWxzZSBpZiAoaGlzdC5kb25lLmxlbmd0aCA+IDEgJiYgIWhpc3QuZG9uZVtoaXN0LmRvbmUubGVuZ3RoIC0gMl0ucmFuZ2VzKSB7XG4gICAgICBoaXN0LmRvbmUucG9wKCk7XG4gICAgICByZXR1cm4gbHN0KGhpc3QuZG9uZSk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVnaXN0ZXIgYSBjaGFuZ2UgaW4gdGhlIGhpc3RvcnkuIE1lcmdlcyBjaGFuZ2VzIHRoYXQgYXJlIHdpdGhpblxuICAvLyBhIHNpbmdsZSBvcGVyYXRpb24sIG9yZSBhcmUgY2xvc2UgdG9nZXRoZXIgd2l0aCBhbiBvcmlnaW4gdGhhdFxuICAvLyBhbGxvd3MgbWVyZ2luZyAoc3RhcnRpbmcgd2l0aCBcIitcIikgaW50byBhIHNpbmdsZSBldmVudC5cbiAgZnVuY3Rpb24gYWRkQ2hhbmdlVG9IaXN0b3J5KGRvYywgY2hhbmdlLCBzZWxBZnRlciwgb3BJZCkge1xuICAgIHZhciBoaXN0ID0gZG9jLmhpc3Rvcnk7XG4gICAgaGlzdC51bmRvbmUubGVuZ3RoID0gMDtcbiAgICB2YXIgdGltZSA9ICtuZXcgRGF0ZSwgY3VyO1xuXG4gICAgaWYgKChoaXN0Lmxhc3RPcCA9PSBvcElkIHx8XG4gICAgICAgICBoaXN0Lmxhc3RPcmlnaW4gPT0gY2hhbmdlLm9yaWdpbiAmJiBjaGFuZ2Uub3JpZ2luICYmXG4gICAgICAgICAoKGNoYW5nZS5vcmlnaW4uY2hhckF0KDApID09IFwiK1wiICYmIGRvYy5jbSAmJiBoaXN0Lmxhc3RNb2RUaW1lID4gdGltZSAtIGRvYy5jbS5vcHRpb25zLmhpc3RvcnlFdmVudERlbGF5KSB8fFxuICAgICAgICAgIGNoYW5nZS5vcmlnaW4uY2hhckF0KDApID09IFwiKlwiKSkgJiZcbiAgICAgICAgKGN1ciA9IGxhc3RDaGFuZ2VFdmVudChoaXN0LCBoaXN0Lmxhc3RPcCA9PSBvcElkKSkpIHtcbiAgICAgIC8vIE1lcmdlIHRoaXMgY2hhbmdlIGludG8gdGhlIGxhc3QgZXZlbnRcbiAgICAgIHZhciBsYXN0ID0gbHN0KGN1ci5jaGFuZ2VzKTtcbiAgICAgIGlmIChjbXAoY2hhbmdlLmZyb20sIGNoYW5nZS50bykgPT0gMCAmJiBjbXAoY2hhbmdlLmZyb20sIGxhc3QudG8pID09IDApIHtcbiAgICAgICAgLy8gT3B0aW1pemVkIGNhc2UgZm9yIHNpbXBsZSBpbnNlcnRpb24gLS0gZG9uJ3Qgd2FudCB0byBhZGRcbiAgICAgICAgLy8gbmV3IGNoYW5nZXNldHMgZm9yIGV2ZXJ5IGNoYXJhY3RlciB0eXBlZFxuICAgICAgICBsYXN0LnRvID0gY2hhbmdlRW5kKGNoYW5nZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBBZGQgbmV3IHN1Yi1ldmVudFxuICAgICAgICBjdXIuY2hhbmdlcy5wdXNoKGhpc3RvcnlDaGFuZ2VGcm9tQ2hhbmdlKGRvYywgY2hhbmdlKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENhbiBub3QgYmUgbWVyZ2VkLCBzdGFydCBhIG5ldyBldmVudC5cbiAgICAgIHZhciBiZWZvcmUgPSBsc3QoaGlzdC5kb25lKTtcbiAgICAgIGlmICghYmVmb3JlIHx8ICFiZWZvcmUucmFuZ2VzKVxuICAgICAgICBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KGRvYy5zZWwsIGhpc3QuZG9uZSk7XG4gICAgICBjdXIgPSB7Y2hhbmdlczogW2hpc3RvcnlDaGFuZ2VGcm9tQ2hhbmdlKGRvYywgY2hhbmdlKV0sXG4gICAgICAgICAgICAgZ2VuZXJhdGlvbjogaGlzdC5nZW5lcmF0aW9ufTtcbiAgICAgIGhpc3QuZG9uZS5wdXNoKGN1cik7XG4gICAgICB3aGlsZSAoaGlzdC5kb25lLmxlbmd0aCA+IGhpc3QudW5kb0RlcHRoKSB7XG4gICAgICAgIGhpc3QuZG9uZS5zaGlmdCgpO1xuICAgICAgICBpZiAoIWhpc3QuZG9uZVswXS5yYW5nZXMpIGhpc3QuZG9uZS5zaGlmdCgpO1xuICAgICAgfVxuICAgIH1cbiAgICBoaXN0LmRvbmUucHVzaChzZWxBZnRlcik7XG4gICAgaGlzdC5nZW5lcmF0aW9uID0gKytoaXN0Lm1heEdlbmVyYXRpb247XG4gICAgaGlzdC5sYXN0TW9kVGltZSA9IGhpc3QubGFzdFNlbFRpbWUgPSB0aW1lO1xuICAgIGhpc3QubGFzdE9wID0gaGlzdC5sYXN0U2VsT3AgPSBvcElkO1xuICAgIGhpc3QubGFzdE9yaWdpbiA9IGhpc3QubGFzdFNlbE9yaWdpbiA9IGNoYW5nZS5vcmlnaW47XG5cbiAgICBpZiAoIWxhc3QpIHNpZ25hbChkb2MsIFwiaGlzdG9yeUFkZGVkXCIpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2VsZWN0aW9uRXZlbnRDYW5CZU1lcmdlZChkb2MsIG9yaWdpbiwgcHJldiwgc2VsKSB7XG4gICAgdmFyIGNoID0gb3JpZ2luLmNoYXJBdCgwKTtcbiAgICByZXR1cm4gY2ggPT0gXCIqXCIgfHxcbiAgICAgIGNoID09IFwiK1wiICYmXG4gICAgICBwcmV2LnJhbmdlcy5sZW5ndGggPT0gc2VsLnJhbmdlcy5sZW5ndGggJiZcbiAgICAgIHByZXYuc29tZXRoaW5nU2VsZWN0ZWQoKSA9PSBzZWwuc29tZXRoaW5nU2VsZWN0ZWQoKSAmJlxuICAgICAgbmV3IERhdGUgLSBkb2MuaGlzdG9yeS5sYXN0U2VsVGltZSA8PSAoZG9jLmNtID8gZG9jLmNtLm9wdGlvbnMuaGlzdG9yeUV2ZW50RGVsYXkgOiA1MDApO1xuICB9XG5cbiAgLy8gQ2FsbGVkIHdoZW5ldmVyIHRoZSBzZWxlY3Rpb24gY2hhbmdlcywgc2V0cyB0aGUgbmV3IHNlbGVjdGlvbiBhc1xuICAvLyB0aGUgcGVuZGluZyBzZWxlY3Rpb24gaW4gdGhlIGhpc3RvcnksIGFuZCBwdXNoZXMgdGhlIG9sZCBwZW5kaW5nXG4gIC8vIHNlbGVjdGlvbiBpbnRvIHRoZSAnZG9uZScgYXJyYXkgd2hlbiBpdCB3YXMgc2lnbmlmaWNhbnRseVxuICAvLyBkaWZmZXJlbnQgKGluIG51bWJlciBvZiBzZWxlY3RlZCByYW5nZXMsIGVtcHRpbmVzcywgb3IgdGltZSkuXG4gIGZ1bmN0aW9uIGFkZFNlbGVjdGlvblRvSGlzdG9yeShkb2MsIHNlbCwgb3BJZCwgb3B0aW9ucykge1xuICAgIHZhciBoaXN0ID0gZG9jLmhpc3RvcnksIG9yaWdpbiA9IG9wdGlvbnMgJiYgb3B0aW9ucy5vcmlnaW47XG5cbiAgICAvLyBBIG5ldyBldmVudCBpcyBzdGFydGVkIHdoZW4gdGhlIHByZXZpb3VzIG9yaWdpbiBkb2VzIG5vdCBtYXRjaFxuICAgIC8vIHRoZSBjdXJyZW50LCBvciB0aGUgb3JpZ2lucyBkb24ndCBhbGxvdyBtYXRjaGluZy4gT3JpZ2luc1xuICAgIC8vIHN0YXJ0aW5nIHdpdGggKiBhcmUgYWx3YXlzIG1lcmdlZCwgdGhvc2Ugc3RhcnRpbmcgd2l0aCArIGFyZVxuICAgIC8vIG1lcmdlZCB3aGVuIHNpbWlsYXIgYW5kIGNsb3NlIHRvZ2V0aGVyIGluIHRpbWUuXG4gICAgaWYgKG9wSWQgPT0gaGlzdC5sYXN0U2VsT3AgfHxcbiAgICAgICAgKG9yaWdpbiAmJiBoaXN0Lmxhc3RTZWxPcmlnaW4gPT0gb3JpZ2luICYmXG4gICAgICAgICAoaGlzdC5sYXN0TW9kVGltZSA9PSBoaXN0Lmxhc3RTZWxUaW1lICYmIGhpc3QubGFzdE9yaWdpbiA9PSBvcmlnaW4gfHxcbiAgICAgICAgICBzZWxlY3Rpb25FdmVudENhbkJlTWVyZ2VkKGRvYywgb3JpZ2luLCBsc3QoaGlzdC5kb25lKSwgc2VsKSkpKVxuICAgICAgaGlzdC5kb25lW2hpc3QuZG9uZS5sZW5ndGggLSAxXSA9IHNlbDtcbiAgICBlbHNlXG4gICAgICBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KHNlbCwgaGlzdC5kb25lKTtcblxuICAgIGhpc3QubGFzdFNlbFRpbWUgPSArbmV3IERhdGU7XG4gICAgaGlzdC5sYXN0U2VsT3JpZ2luID0gb3JpZ2luO1xuICAgIGhpc3QubGFzdFNlbE9wID0gb3BJZDtcbiAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmNsZWFyUmVkbyAhPT0gZmFsc2UpXG4gICAgICBjbGVhclNlbGVjdGlvbkV2ZW50cyhoaXN0LnVuZG9uZSk7XG4gIH1cblxuICBmdW5jdGlvbiBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KHNlbCwgZGVzdCkge1xuICAgIHZhciB0b3AgPSBsc3QoZGVzdCk7XG4gICAgaWYgKCEodG9wICYmIHRvcC5yYW5nZXMgJiYgdG9wLmVxdWFscyhzZWwpKSlcbiAgICAgIGRlc3QucHVzaChzZWwpO1xuICB9XG5cbiAgLy8gVXNlZCB0byBzdG9yZSBtYXJrZWQgc3BhbiBpbmZvcm1hdGlvbiBpbiB0aGUgaGlzdG9yeS5cbiAgZnVuY3Rpb24gYXR0YWNoTG9jYWxTcGFucyhkb2MsIGNoYW5nZSwgZnJvbSwgdG8pIHtcbiAgICB2YXIgZXhpc3RpbmcgPSBjaGFuZ2VbXCJzcGFuc19cIiArIGRvYy5pZF0sIG4gPSAwO1xuICAgIGRvYy5pdGVyKE1hdGgubWF4KGRvYy5maXJzdCwgZnJvbSksIE1hdGgubWluKGRvYy5maXJzdCArIGRvYy5zaXplLCB0byksIGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgIGlmIChsaW5lLm1hcmtlZFNwYW5zKVxuICAgICAgICAoZXhpc3RpbmcgfHwgKGV4aXN0aW5nID0gY2hhbmdlW1wic3BhbnNfXCIgKyBkb2MuaWRdID0ge30pKVtuXSA9IGxpbmUubWFya2VkU3BhbnM7XG4gICAgICArK247XG4gICAgfSk7XG4gIH1cblxuICAvLyBXaGVuIHVuL3JlLWRvaW5nIHJlc3RvcmVzIHRleHQgY29udGFpbmluZyBtYXJrZWQgc3BhbnMsIHRob3NlXG4gIC8vIHRoYXQgaGF2ZSBiZWVuIGV4cGxpY2l0bHkgY2xlYXJlZCBzaG91bGQgbm90IGJlIHJlc3RvcmVkLlxuICBmdW5jdGlvbiByZW1vdmVDbGVhcmVkU3BhbnMoc3BhbnMpIHtcbiAgICBpZiAoIXNwYW5zKSByZXR1cm4gbnVsbDtcbiAgICBmb3IgKHZhciBpID0gMCwgb3V0OyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChzcGFuc1tpXS5tYXJrZXIuZXhwbGljaXRseUNsZWFyZWQpIHsgaWYgKCFvdXQpIG91dCA9IHNwYW5zLnNsaWNlKDAsIGkpOyB9XG4gICAgICBlbHNlIGlmIChvdXQpIG91dC5wdXNoKHNwYW5zW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuICFvdXQgPyBzcGFucyA6IG91dC5sZW5ndGggPyBvdXQgOiBudWxsO1xuICB9XG5cbiAgLy8gUmV0cmlldmUgYW5kIGZpbHRlciB0aGUgb2xkIG1hcmtlZCBzcGFucyBzdG9yZWQgaW4gYSBjaGFuZ2UgZXZlbnQuXG4gIGZ1bmN0aW9uIGdldE9sZFNwYW5zKGRvYywgY2hhbmdlKSB7XG4gICAgdmFyIGZvdW5kID0gY2hhbmdlW1wic3BhbnNfXCIgKyBkb2MuaWRdO1xuICAgIGlmICghZm91bmQpIHJldHVybiBudWxsO1xuICAgIGZvciAodmFyIGkgPSAwLCBudyA9IFtdOyBpIDwgY2hhbmdlLnRleHQubGVuZ3RoOyArK2kpXG4gICAgICBudy5wdXNoKHJlbW92ZUNsZWFyZWRTcGFucyhmb3VuZFtpXSkpO1xuICAgIHJldHVybiBudztcbiAgfVxuXG4gIC8vIFVzZWQgYm90aCB0byBwcm92aWRlIGEgSlNPTi1zYWZlIG9iamVjdCBpbiAuZ2V0SGlzdG9yeSwgYW5kLCB3aGVuXG4gIC8vIGRldGFjaGluZyBhIGRvY3VtZW50LCB0byBzcGxpdCB0aGUgaGlzdG9yeSBpbiB0d29cbiAgZnVuY3Rpb24gY29weUhpc3RvcnlBcnJheShldmVudHMsIG5ld0dyb3VwLCBpbnN0YW50aWF0ZVNlbCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBjb3B5ID0gW107IGkgPCBldmVudHMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBldmVudCA9IGV2ZW50c1tpXTtcbiAgICAgIGlmIChldmVudC5yYW5nZXMpIHtcbiAgICAgICAgY29weS5wdXNoKGluc3RhbnRpYXRlU2VsID8gU2VsZWN0aW9uLnByb3RvdHlwZS5kZWVwQ29weS5jYWxsKGV2ZW50KSA6IGV2ZW50KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICB2YXIgY2hhbmdlcyA9IGV2ZW50LmNoYW5nZXMsIG5ld0NoYW5nZXMgPSBbXTtcbiAgICAgIGNvcHkucHVzaCh7Y2hhbmdlczogbmV3Q2hhbmdlc30pO1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjaGFuZ2VzLmxlbmd0aDsgKytqKSB7XG4gICAgICAgIHZhciBjaGFuZ2UgPSBjaGFuZ2VzW2pdLCBtO1xuICAgICAgICBuZXdDaGFuZ2VzLnB1c2goe2Zyb206IGNoYW5nZS5mcm9tLCB0bzogY2hhbmdlLnRvLCB0ZXh0OiBjaGFuZ2UudGV4dH0pO1xuICAgICAgICBpZiAobmV3R3JvdXApIGZvciAodmFyIHByb3AgaW4gY2hhbmdlKSBpZiAobSA9IHByb3AubWF0Y2goL15zcGFuc18oXFxkKykkLykpIHtcbiAgICAgICAgICBpZiAoaW5kZXhPZihuZXdHcm91cCwgTnVtYmVyKG1bMV0pKSA+IC0xKSB7XG4gICAgICAgICAgICBsc3QobmV3Q2hhbmdlcylbcHJvcF0gPSBjaGFuZ2VbcHJvcF07XG4gICAgICAgICAgICBkZWxldGUgY2hhbmdlW3Byb3BdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29weTtcbiAgfVxuXG4gIC8vIFJlYmFzaW5nL3Jlc2V0dGluZyBoaXN0b3J5IHRvIGRlYWwgd2l0aCBleHRlcm5hbGx5LXNvdXJjZWQgY2hhbmdlc1xuXG4gIGZ1bmN0aW9uIHJlYmFzZUhpc3RTZWxTaW5nbGUocG9zLCBmcm9tLCB0bywgZGlmZikge1xuICAgIGlmICh0byA8IHBvcy5saW5lKSB7XG4gICAgICBwb3MubGluZSArPSBkaWZmO1xuICAgIH0gZWxzZSBpZiAoZnJvbSA8IHBvcy5saW5lKSB7XG4gICAgICBwb3MubGluZSA9IGZyb207XG4gICAgICBwb3MuY2ggPSAwO1xuICAgIH1cbiAgfVxuXG4gIC8vIFRyaWVzIHRvIHJlYmFzZSBhbiBhcnJheSBvZiBoaXN0b3J5IGV2ZW50cyBnaXZlbiBhIGNoYW5nZSBpbiB0aGVcbiAgLy8gZG9jdW1lbnQuIElmIHRoZSBjaGFuZ2UgdG91Y2hlcyB0aGUgc2FtZSBsaW5lcyBhcyB0aGUgZXZlbnQsIHRoZVxuICAvLyBldmVudCwgYW5kIGV2ZXJ5dGhpbmcgJ2JlaGluZCcgaXQsIGlzIGRpc2NhcmRlZC4gSWYgdGhlIGNoYW5nZSBpc1xuICAvLyBiZWZvcmUgdGhlIGV2ZW50LCB0aGUgZXZlbnQncyBwb3NpdGlvbnMgYXJlIHVwZGF0ZWQuIFVzZXMgYVxuICAvLyBjb3B5LW9uLXdyaXRlIHNjaGVtZSBmb3IgdGhlIHBvc2l0aW9ucywgdG8gYXZvaWQgaGF2aW5nIHRvXG4gIC8vIHJlYWxsb2NhdGUgdGhlbSBhbGwgb24gZXZlcnkgcmViYXNlLCBidXQgYWxzbyBhdm9pZCBwcm9ibGVtcyB3aXRoXG4gIC8vIHNoYXJlZCBwb3NpdGlvbiBvYmplY3RzIGJlaW5nIHVuc2FmZWx5IHVwZGF0ZWQuXG4gIGZ1bmN0aW9uIHJlYmFzZUhpc3RBcnJheShhcnJheSwgZnJvbSwgdG8sIGRpZmYpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3ViID0gYXJyYXlbaV0sIG9rID0gdHJ1ZTtcbiAgICAgIGlmIChzdWIucmFuZ2VzKSB7XG4gICAgICAgIGlmICghc3ViLmNvcGllZCkgeyBzdWIgPSBhcnJheVtpXSA9IHN1Yi5kZWVwQ29weSgpOyBzdWIuY29waWVkID0gdHJ1ZTsgfVxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHN1Yi5yYW5nZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICByZWJhc2VIaXN0U2VsU2luZ2xlKHN1Yi5yYW5nZXNbal0uYW5jaG9yLCBmcm9tLCB0bywgZGlmZik7XG4gICAgICAgICAgcmViYXNlSGlzdFNlbFNpbmdsZShzdWIucmFuZ2VzW2pdLmhlYWQsIGZyb20sIHRvLCBkaWZmKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc3ViLmNoYW5nZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgdmFyIGN1ciA9IHN1Yi5jaGFuZ2VzW2pdO1xuICAgICAgICBpZiAodG8gPCBjdXIuZnJvbS5saW5lKSB7XG4gICAgICAgICAgY3VyLmZyb20gPSBQb3MoY3VyLmZyb20ubGluZSArIGRpZmYsIGN1ci5mcm9tLmNoKTtcbiAgICAgICAgICBjdXIudG8gPSBQb3MoY3VyLnRvLmxpbmUgKyBkaWZmLCBjdXIudG8uY2gpO1xuICAgICAgICB9IGVsc2UgaWYgKGZyb20gPD0gY3VyLnRvLmxpbmUpIHtcbiAgICAgICAgICBvayA9IGZhbHNlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIW9rKSB7XG4gICAgICAgIGFycmF5LnNwbGljZSgwLCBpICsgMSk7XG4gICAgICAgIGkgPSAwO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlYmFzZUhpc3QoaGlzdCwgY2hhbmdlKSB7XG4gICAgdmFyIGZyb20gPSBjaGFuZ2UuZnJvbS5saW5lLCB0byA9IGNoYW5nZS50by5saW5lLCBkaWZmID0gY2hhbmdlLnRleHQubGVuZ3RoIC0gKHRvIC0gZnJvbSkgLSAxO1xuICAgIHJlYmFzZUhpc3RBcnJheShoaXN0LmRvbmUsIGZyb20sIHRvLCBkaWZmKTtcbiAgICByZWJhc2VIaXN0QXJyYXkoaGlzdC51bmRvbmUsIGZyb20sIHRvLCBkaWZmKTtcbiAgfVxuXG4gIC8vIEVWRU5UIFVUSUxJVElFU1xuXG4gIC8vIER1ZSB0byB0aGUgZmFjdCB0aGF0IHdlIHN0aWxsIHN1cHBvcnQganVyYXNzaWMgSUUgdmVyc2lvbnMsIHNvbWVcbiAgLy8gY29tcGF0aWJpbGl0eSB3cmFwcGVycyBhcmUgbmVlZGVkLlxuXG4gIHZhciBlX3ByZXZlbnREZWZhdWx0ID0gQ29kZU1pcnJvci5lX3ByZXZlbnREZWZhdWx0ID0gZnVuY3Rpb24oZSkge1xuICAgIGlmIChlLnByZXZlbnREZWZhdWx0KSBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZWxzZSBlLnJldHVyblZhbHVlID0gZmFsc2U7XG4gIH07XG4gIHZhciBlX3N0b3BQcm9wYWdhdGlvbiA9IENvZGVNaXJyb3IuZV9zdG9wUHJvcGFnYXRpb24gPSBmdW5jdGlvbihlKSB7XG4gICAgaWYgKGUuc3RvcFByb3BhZ2F0aW9uKSBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGVsc2UgZS5jYW5jZWxCdWJibGUgPSB0cnVlO1xuICB9O1xuICBmdW5jdGlvbiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSkge1xuICAgIHJldHVybiBlLmRlZmF1bHRQcmV2ZW50ZWQgIT0gbnVsbCA/IGUuZGVmYXVsdFByZXZlbnRlZCA6IGUucmV0dXJuVmFsdWUgPT0gZmFsc2U7XG4gIH1cbiAgdmFyIGVfc3RvcCA9IENvZGVNaXJyb3IuZV9zdG9wID0gZnVuY3Rpb24oZSkge2VfcHJldmVudERlZmF1bHQoZSk7IGVfc3RvcFByb3BhZ2F0aW9uKGUpO307XG5cbiAgZnVuY3Rpb24gZV90YXJnZXQoZSkge3JldHVybiBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7fVxuICBmdW5jdGlvbiBlX2J1dHRvbihlKSB7XG4gICAgdmFyIGIgPSBlLndoaWNoO1xuICAgIGlmIChiID09IG51bGwpIHtcbiAgICAgIGlmIChlLmJ1dHRvbiAmIDEpIGIgPSAxO1xuICAgICAgZWxzZSBpZiAoZS5idXR0b24gJiAyKSBiID0gMztcbiAgICAgIGVsc2UgaWYgKGUuYnV0dG9uICYgNCkgYiA9IDI7XG4gICAgfVxuICAgIGlmIChtYWMgJiYgZS5jdHJsS2V5ICYmIGIgPT0gMSkgYiA9IDM7XG4gICAgcmV0dXJuIGI7XG4gIH1cblxuICAvLyBFVkVOVCBIQU5ETElOR1xuXG4gIC8vIExpZ2h0d2VpZ2h0IGV2ZW50IGZyYW1ld29yay4gb24vb2ZmIGFsc28gd29yayBvbiBET00gbm9kZXMsXG4gIC8vIHJlZ2lzdGVyaW5nIG5hdGl2ZSBET00gaGFuZGxlcnMuXG5cbiAgdmFyIG9uID0gQ29kZU1pcnJvci5vbiA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUsIGYpIHtcbiAgICBpZiAoZW1pdHRlci5hZGRFdmVudExpc3RlbmVyKVxuICAgICAgZW1pdHRlci5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGYsIGZhbHNlKTtcbiAgICBlbHNlIGlmIChlbWl0dGVyLmF0dGFjaEV2ZW50KVxuICAgICAgZW1pdHRlci5hdHRhY2hFdmVudChcIm9uXCIgKyB0eXBlLCBmKTtcbiAgICBlbHNlIHtcbiAgICAgIHZhciBtYXAgPSBlbWl0dGVyLl9oYW5kbGVycyB8fCAoZW1pdHRlci5faGFuZGxlcnMgPSB7fSk7XG4gICAgICB2YXIgYXJyID0gbWFwW3R5cGVdIHx8IChtYXBbdHlwZV0gPSBbXSk7XG4gICAgICBhcnIucHVzaChmKTtcbiAgICB9XG4gIH07XG5cbiAgdmFyIG5vSGFuZGxlcnMgPSBbXVxuICBmdW5jdGlvbiBnZXRIYW5kbGVycyhlbWl0dGVyLCB0eXBlLCBjb3B5KSB7XG4gICAgdmFyIGFyciA9IGVtaXR0ZXIuX2hhbmRsZXJzICYmIGVtaXR0ZXIuX2hhbmRsZXJzW3R5cGVdXG4gICAgaWYgKGNvcHkpIHJldHVybiBhcnIgJiYgYXJyLmxlbmd0aCA+IDAgPyBhcnIuc2xpY2UoKSA6IG5vSGFuZGxlcnNcbiAgICBlbHNlIHJldHVybiBhcnIgfHwgbm9IYW5kbGVyc1xuICB9XG5cbiAgdmFyIG9mZiA9IENvZGVNaXJyb3Iub2ZmID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSwgZikge1xuICAgIGlmIChlbWl0dGVyLnJlbW92ZUV2ZW50TGlzdGVuZXIpXG4gICAgICBlbWl0dGVyLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgZiwgZmFsc2UpO1xuICAgIGVsc2UgaWYgKGVtaXR0ZXIuZGV0YWNoRXZlbnQpXG4gICAgICBlbWl0dGVyLmRldGFjaEV2ZW50KFwib25cIiArIHR5cGUsIGYpO1xuICAgIGVsc2Uge1xuICAgICAgdmFyIGhhbmRsZXJzID0gZ2V0SGFuZGxlcnMoZW1pdHRlciwgdHlwZSwgZmFsc2UpXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhhbmRsZXJzLmxlbmd0aDsgKytpKVxuICAgICAgICBpZiAoaGFuZGxlcnNbaV0gPT0gZikgeyBoYW5kbGVycy5zcGxpY2UoaSwgMSk7IGJyZWFrOyB9XG4gICAgfVxuICB9O1xuXG4gIHZhciBzaWduYWwgPSBDb2RlTWlycm9yLnNpZ25hbCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUgLyosIHZhbHVlcy4uLiovKSB7XG4gICAgdmFyIGhhbmRsZXJzID0gZ2V0SGFuZGxlcnMoZW1pdHRlciwgdHlwZSwgdHJ1ZSlcbiAgICBpZiAoIWhhbmRsZXJzLmxlbmd0aCkgcmV0dXJuO1xuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhhbmRsZXJzLmxlbmd0aDsgKytpKSBoYW5kbGVyc1tpXS5hcHBseShudWxsLCBhcmdzKTtcbiAgfTtcblxuICB2YXIgb3JwaGFuRGVsYXllZENhbGxiYWNrcyA9IG51bGw7XG5cbiAgLy8gT2Z0ZW4sIHdlIHdhbnQgdG8gc2lnbmFsIGV2ZW50cyBhdCBhIHBvaW50IHdoZXJlIHdlIGFyZSBpbiB0aGVcbiAgLy8gbWlkZGxlIG9mIHNvbWUgd29yaywgYnV0IGRvbid0IHdhbnQgdGhlIGhhbmRsZXIgdG8gc3RhcnQgY2FsbGluZ1xuICAvLyBvdGhlciBtZXRob2RzIG9uIHRoZSBlZGl0b3IsIHdoaWNoIG1pZ2h0IGJlIGluIGFuIGluY29uc2lzdGVudFxuICAvLyBzdGF0ZSBvciBzaW1wbHkgbm90IGV4cGVjdCBhbnkgb3RoZXIgZXZlbnRzIHRvIGhhcHBlbi5cbiAgLy8gc2lnbmFsTGF0ZXIgbG9va3Mgd2hldGhlciB0aGVyZSBhcmUgYW55IGhhbmRsZXJzLCBhbmQgc2NoZWR1bGVzXG4gIC8vIHRoZW0gdG8gYmUgZXhlY3V0ZWQgd2hlbiB0aGUgbGFzdCBvcGVyYXRpb24gZW5kcywgb3IsIGlmIG5vXG4gIC8vIG9wZXJhdGlvbiBpcyBhY3RpdmUsIHdoZW4gYSB0aW1lb3V0IGZpcmVzLlxuICBmdW5jdGlvbiBzaWduYWxMYXRlcihlbWl0dGVyLCB0eXBlIC8qLCB2YWx1ZXMuLi4qLykge1xuICAgIHZhciBhcnIgPSBnZXRIYW5kbGVycyhlbWl0dGVyLCB0eXBlLCBmYWxzZSlcbiAgICBpZiAoIWFyci5sZW5ndGgpIHJldHVybjtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMiksIGxpc3Q7XG4gICAgaWYgKG9wZXJhdGlvbkdyb3VwKSB7XG4gICAgICBsaXN0ID0gb3BlcmF0aW9uR3JvdXAuZGVsYXllZENhbGxiYWNrcztcbiAgICB9IGVsc2UgaWYgKG9ycGhhbkRlbGF5ZWRDYWxsYmFja3MpIHtcbiAgICAgIGxpc3QgPSBvcnBoYW5EZWxheWVkQ2FsbGJhY2tzO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaXN0ID0gb3JwaGFuRGVsYXllZENhbGxiYWNrcyA9IFtdO1xuICAgICAgc2V0VGltZW91dChmaXJlT3JwaGFuRGVsYXllZCwgMCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGJuZChmKSB7cmV0dXJuIGZ1bmN0aW9uKCl7Zi5hcHBseShudWxsLCBhcmdzKTt9O307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyArK2kpXG4gICAgICBsaXN0LnB1c2goYm5kKGFycltpXSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gZmlyZU9ycGhhbkRlbGF5ZWQoKSB7XG4gICAgdmFyIGRlbGF5ZWQgPSBvcnBoYW5EZWxheWVkQ2FsbGJhY2tzO1xuICAgIG9ycGhhbkRlbGF5ZWRDYWxsYmFja3MgPSBudWxsO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsYXllZC5sZW5ndGg7ICsraSkgZGVsYXllZFtpXSgpO1xuICB9XG5cbiAgLy8gVGhlIERPTSBldmVudHMgdGhhdCBDb2RlTWlycm9yIGhhbmRsZXMgY2FuIGJlIG92ZXJyaWRkZW4gYnlcbiAgLy8gcmVnaXN0ZXJpbmcgYSAobm9uLURPTSkgaGFuZGxlciBvbiB0aGUgZWRpdG9yIGZvciB0aGUgZXZlbnQgbmFtZSxcbiAgLy8gYW5kIHByZXZlbnREZWZhdWx0LWluZyB0aGUgZXZlbnQgaW4gdGhhdCBoYW5kbGVyLlxuICBmdW5jdGlvbiBzaWduYWxET01FdmVudChjbSwgZSwgb3ZlcnJpZGUpIHtcbiAgICBpZiAodHlwZW9mIGUgPT0gXCJzdHJpbmdcIilcbiAgICAgIGUgPSB7dHlwZTogZSwgcHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uKCkgeyB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlOyB9fTtcbiAgICBzaWduYWwoY20sIG92ZXJyaWRlIHx8IGUudHlwZSwgY20sIGUpO1xuICAgIHJldHVybiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSkgfHwgZS5jb2RlbWlycm9ySWdub3JlO1xuICB9XG5cbiAgZnVuY3Rpb24gc2lnbmFsQ3Vyc29yQWN0aXZpdHkoY20pIHtcbiAgICB2YXIgYXJyID0gY20uX2hhbmRsZXJzICYmIGNtLl9oYW5kbGVycy5jdXJzb3JBY3Rpdml0eTtcbiAgICBpZiAoIWFycikgcmV0dXJuO1xuICAgIHZhciBzZXQgPSBjbS5jdXJPcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzIHx8IChjbS5jdXJPcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzID0gW10pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgKytpKSBpZiAoaW5kZXhPZihzZXQsIGFycltpXSkgPT0gLTEpXG4gICAgICBzZXQucHVzaChhcnJbaV0pO1xuICB9XG5cbiAgZnVuY3Rpb24gaGFzSGFuZGxlcihlbWl0dGVyLCB0eXBlKSB7XG4gICAgcmV0dXJuIGdldEhhbmRsZXJzKGVtaXR0ZXIsIHR5cGUpLmxlbmd0aCA+IDBcbiAgfVxuXG4gIC8vIEFkZCBvbiBhbmQgb2ZmIG1ldGhvZHMgdG8gYSBjb25zdHJ1Y3RvcidzIHByb3RvdHlwZSwgdG8gbWFrZVxuICAvLyByZWdpc3RlcmluZyBldmVudHMgb24gc3VjaCBvYmplY3RzIG1vcmUgY29udmVuaWVudC5cbiAgZnVuY3Rpb24gZXZlbnRNaXhpbihjdG9yKSB7XG4gICAgY3Rvci5wcm90b3R5cGUub24gPSBmdW5jdGlvbih0eXBlLCBmKSB7b24odGhpcywgdHlwZSwgZik7fTtcbiAgICBjdG9yLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbih0eXBlLCBmKSB7b2ZmKHRoaXMsIHR5cGUsIGYpO307XG4gIH1cblxuICAvLyBNSVNDIFVUSUxJVElFU1xuXG4gIC8vIE51bWJlciBvZiBwaXhlbHMgYWRkZWQgdG8gc2Nyb2xsZXIgYW5kIHNpemVyIHRvIGhpZGUgc2Nyb2xsYmFyXG4gIHZhciBzY3JvbGxlckdhcCA9IDMwO1xuXG4gIC8vIFJldHVybmVkIG9yIHRocm93biBieSB2YXJpb3VzIHByb3RvY29scyB0byBzaWduYWwgJ0knbSBub3RcbiAgLy8gaGFuZGxpbmcgdGhpcycuXG4gIHZhciBQYXNzID0gQ29kZU1pcnJvci5QYXNzID0ge3RvU3RyaW5nOiBmdW5jdGlvbigpe3JldHVybiBcIkNvZGVNaXJyb3IuUGFzc1wiO319O1xuXG4gIC8vIFJldXNlZCBvcHRpb24gb2JqZWN0cyBmb3Igc2V0U2VsZWN0aW9uICYgZnJpZW5kc1xuICB2YXIgc2VsX2RvbnRTY3JvbGwgPSB7c2Nyb2xsOiBmYWxzZX0sIHNlbF9tb3VzZSA9IHtvcmlnaW46IFwiKm1vdXNlXCJ9LCBzZWxfbW92ZSA9IHtvcmlnaW46IFwiK21vdmVcIn07XG5cbiAgZnVuY3Rpb24gRGVsYXllZCgpIHt0aGlzLmlkID0gbnVsbDt9XG4gIERlbGF5ZWQucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uKG1zLCBmKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuaWQpO1xuICAgIHRoaXMuaWQgPSBzZXRUaW1lb3V0KGYsIG1zKTtcbiAgfTtcblxuICAvLyBDb3VudHMgdGhlIGNvbHVtbiBvZmZzZXQgaW4gYSBzdHJpbmcsIHRha2luZyB0YWJzIGludG8gYWNjb3VudC5cbiAgLy8gVXNlZCBtb3N0bHkgdG8gZmluZCBpbmRlbnRhdGlvbi5cbiAgdmFyIGNvdW50Q29sdW1uID0gQ29kZU1pcnJvci5jb3VudENvbHVtbiA9IGZ1bmN0aW9uKHN0cmluZywgZW5kLCB0YWJTaXplLCBzdGFydEluZGV4LCBzdGFydFZhbHVlKSB7XG4gICAgaWYgKGVuZCA9PSBudWxsKSB7XG4gICAgICBlbmQgPSBzdHJpbmcuc2VhcmNoKC9bXlxcc1xcdTAwYTBdLyk7XG4gICAgICBpZiAoZW5kID09IC0xKSBlbmQgPSBzdHJpbmcubGVuZ3RoO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gc3RhcnRJbmRleCB8fCAwLCBuID0gc3RhcnRWYWx1ZSB8fCAwOzspIHtcbiAgICAgIHZhciBuZXh0VGFiID0gc3RyaW5nLmluZGV4T2YoXCJcXHRcIiwgaSk7XG4gICAgICBpZiAobmV4dFRhYiA8IDAgfHwgbmV4dFRhYiA+PSBlbmQpXG4gICAgICAgIHJldHVybiBuICsgKGVuZCAtIGkpO1xuICAgICAgbiArPSBuZXh0VGFiIC0gaTtcbiAgICAgIG4gKz0gdGFiU2l6ZSAtIChuICUgdGFiU2l6ZSk7XG4gICAgICBpID0gbmV4dFRhYiArIDE7XG4gICAgfVxuICB9O1xuXG4gIC8vIFRoZSBpbnZlcnNlIG9mIGNvdW50Q29sdW1uIC0tIGZpbmQgdGhlIG9mZnNldCB0aGF0IGNvcnJlc3BvbmRzIHRvXG4gIC8vIGEgcGFydGljdWxhciBjb2x1bW4uXG4gIHZhciBmaW5kQ29sdW1uID0gQ29kZU1pcnJvci5maW5kQ29sdW1uID0gZnVuY3Rpb24oc3RyaW5nLCBnb2FsLCB0YWJTaXplKSB7XG4gICAgZm9yICh2YXIgcG9zID0gMCwgY29sID0gMDs7KSB7XG4gICAgICB2YXIgbmV4dFRhYiA9IHN0cmluZy5pbmRleE9mKFwiXFx0XCIsIHBvcyk7XG4gICAgICBpZiAobmV4dFRhYiA9PSAtMSkgbmV4dFRhYiA9IHN0cmluZy5sZW5ndGg7XG4gICAgICB2YXIgc2tpcHBlZCA9IG5leHRUYWIgLSBwb3M7XG4gICAgICBpZiAobmV4dFRhYiA9PSBzdHJpbmcubGVuZ3RoIHx8IGNvbCArIHNraXBwZWQgPj0gZ29hbClcbiAgICAgICAgcmV0dXJuIHBvcyArIE1hdGgubWluKHNraXBwZWQsIGdvYWwgLSBjb2wpO1xuICAgICAgY29sICs9IG5leHRUYWIgLSBwb3M7XG4gICAgICBjb2wgKz0gdGFiU2l6ZSAtIChjb2wgJSB0YWJTaXplKTtcbiAgICAgIHBvcyA9IG5leHRUYWIgKyAxO1xuICAgICAgaWYgKGNvbCA+PSBnb2FsKSByZXR1cm4gcG9zO1xuICAgIH1cbiAgfVxuXG4gIHZhciBzcGFjZVN0cnMgPSBbXCJcIl07XG4gIGZ1bmN0aW9uIHNwYWNlU3RyKG4pIHtcbiAgICB3aGlsZSAoc3BhY2VTdHJzLmxlbmd0aCA8PSBuKVxuICAgICAgc3BhY2VTdHJzLnB1c2gobHN0KHNwYWNlU3RycykgKyBcIiBcIik7XG4gICAgcmV0dXJuIHNwYWNlU3Ryc1tuXTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGxzdChhcnIpIHsgcmV0dXJuIGFyclthcnIubGVuZ3RoLTFdOyB9XG5cbiAgdmFyIHNlbGVjdElucHV0ID0gZnVuY3Rpb24obm9kZSkgeyBub2RlLnNlbGVjdCgpOyB9O1xuICBpZiAoaW9zKSAvLyBNb2JpbGUgU2FmYXJpIGFwcGFyZW50bHkgaGFzIGEgYnVnIHdoZXJlIHNlbGVjdCgpIGlzIGJyb2tlbi5cbiAgICBzZWxlY3RJbnB1dCA9IGZ1bmN0aW9uKG5vZGUpIHsgbm9kZS5zZWxlY3Rpb25TdGFydCA9IDA7IG5vZGUuc2VsZWN0aW9uRW5kID0gbm9kZS52YWx1ZS5sZW5ndGg7IH07XG4gIGVsc2UgaWYgKGllKSAvLyBTdXBwcmVzcyBteXN0ZXJpb3VzIElFMTAgZXJyb3JzXG4gICAgc2VsZWN0SW5wdXQgPSBmdW5jdGlvbihub2RlKSB7IHRyeSB7IG5vZGUuc2VsZWN0KCk7IH0gY2F0Y2goX2UpIHt9IH07XG5cbiAgZnVuY3Rpb24gaW5kZXhPZihhcnJheSwgZWx0KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSlcbiAgICAgIGlmIChhcnJheVtpXSA9PSBlbHQpIHJldHVybiBpO1xuICAgIHJldHVybiAtMTtcbiAgfVxuICBmdW5jdGlvbiBtYXAoYXJyYXksIGYpIHtcbiAgICB2YXIgb3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykgb3V0W2ldID0gZihhcnJheVtpXSwgaSk7XG4gICAgcmV0dXJuIG91dDtcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGhpbmcoKSB7fVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU9iaihiYXNlLCBwcm9wcykge1xuICAgIHZhciBpbnN0O1xuICAgIGlmIChPYmplY3QuY3JlYXRlKSB7XG4gICAgICBpbnN0ID0gT2JqZWN0LmNyZWF0ZShiYXNlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbm90aGluZy5wcm90b3R5cGUgPSBiYXNlO1xuICAgICAgaW5zdCA9IG5ldyBub3RoaW5nKCk7XG4gICAgfVxuICAgIGlmIChwcm9wcykgY29weU9iaihwcm9wcywgaW5zdCk7XG4gICAgcmV0dXJuIGluc3Q7XG4gIH07XG5cbiAgZnVuY3Rpb24gY29weU9iaihvYmosIHRhcmdldCwgb3ZlcndyaXRlKSB7XG4gICAgaWYgKCF0YXJnZXQpIHRhcmdldCA9IHt9O1xuICAgIGZvciAodmFyIHByb3AgaW4gb2JqKVxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSAmJiAob3ZlcndyaXRlICE9PSBmYWxzZSB8fCAhdGFyZ2V0Lmhhc093blByb3BlcnR5KHByb3ApKSlcbiAgICAgICAgdGFyZ2V0W3Byb3BdID0gb2JqW3Byb3BdO1xuICAgIHJldHVybiB0YXJnZXQ7XG4gIH1cblxuICBmdW5jdGlvbiBiaW5kKGYpIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCl7cmV0dXJuIGYuYXBwbHkobnVsbCwgYXJncyk7fTtcbiAgfVxuXG4gIHZhciBub25BU0NJSVNpbmdsZUNhc2VXb3JkQ2hhciA9IC9bXFx1MDBkZlxcdTA1ODdcXHUwNTkwLVxcdTA1ZjRcXHUwNjAwLVxcdTA2ZmZcXHUzMDQwLVxcdTMwOWZcXHUzMGEwLVxcdTMwZmZcXHUzNDAwLVxcdTRkYjVcXHU0ZTAwLVxcdTlmY2NcXHVhYzAwLVxcdWQ3YWZdLztcbiAgdmFyIGlzV29yZENoYXJCYXNpYyA9IENvZGVNaXJyb3IuaXNXb3JkQ2hhciA9IGZ1bmN0aW9uKGNoKSB7XG4gICAgcmV0dXJuIC9cXHcvLnRlc3QoY2gpIHx8IGNoID4gXCJcXHg4MFwiICYmXG4gICAgICAoY2gudG9VcHBlckNhc2UoKSAhPSBjaC50b0xvd2VyQ2FzZSgpIHx8IG5vbkFTQ0lJU2luZ2xlQ2FzZVdvcmRDaGFyLnRlc3QoY2gpKTtcbiAgfTtcbiAgZnVuY3Rpb24gaXNXb3JkQ2hhcihjaCwgaGVscGVyKSB7XG4gICAgaWYgKCFoZWxwZXIpIHJldHVybiBpc1dvcmRDaGFyQmFzaWMoY2gpO1xuICAgIGlmIChoZWxwZXIuc291cmNlLmluZGV4T2YoXCJcXFxcd1wiKSA+IC0xICYmIGlzV29yZENoYXJCYXNpYyhjaCkpIHJldHVybiB0cnVlO1xuICAgIHJldHVybiBoZWxwZXIudGVzdChjaCk7XG4gIH1cblxuICBmdW5jdGlvbiBpc0VtcHR5KG9iaikge1xuICAgIGZvciAodmFyIG4gaW4gb2JqKSBpZiAob2JqLmhhc093blByb3BlcnR5KG4pICYmIG9ialtuXSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gRXh0ZW5kaW5nIHVuaWNvZGUgY2hhcmFjdGVycy4gQSBzZXJpZXMgb2YgYSBub24tZXh0ZW5kaW5nIGNoYXIgK1xuICAvLyBhbnkgbnVtYmVyIG9mIGV4dGVuZGluZyBjaGFycyBpcyB0cmVhdGVkIGFzIGEgc2luZ2xlIHVuaXQgYXMgZmFyXG4gIC8vIGFzIGVkaXRpbmcgYW5kIG1lYXN1cmluZyBpcyBjb25jZXJuZWQuIFRoaXMgaXMgbm90IGZ1bGx5IGNvcnJlY3QsXG4gIC8vIHNpbmNlIHNvbWUgc2NyaXB0cy9mb250cy9icm93c2VycyBhbHNvIHRyZWF0IG90aGVyIGNvbmZpZ3VyYXRpb25zXG4gIC8vIG9mIGNvZGUgcG9pbnRzIGFzIGEgZ3JvdXAuXG4gIHZhciBleHRlbmRpbmdDaGFycyA9IC9bXFx1MDMwMC1cXHUwMzZmXFx1MDQ4My1cXHUwNDg5XFx1MDU5MS1cXHUwNWJkXFx1MDViZlxcdTA1YzFcXHUwNWMyXFx1MDVjNFxcdTA1YzVcXHUwNWM3XFx1MDYxMC1cXHUwNjFhXFx1MDY0Yi1cXHUwNjVlXFx1MDY3MFxcdTA2ZDYtXFx1MDZkY1xcdTA2ZGUtXFx1MDZlNFxcdTA2ZTdcXHUwNmU4XFx1MDZlYS1cXHUwNmVkXFx1MDcxMVxcdTA3MzAtXFx1MDc0YVxcdTA3YTYtXFx1MDdiMFxcdTA3ZWItXFx1MDdmM1xcdTA4MTYtXFx1MDgxOVxcdTA4MWItXFx1MDgyM1xcdTA4MjUtXFx1MDgyN1xcdTA4MjktXFx1MDgyZFxcdTA5MDAtXFx1MDkwMlxcdTA5M2NcXHUwOTQxLVxcdTA5NDhcXHUwOTRkXFx1MDk1MS1cXHUwOTU1XFx1MDk2MlxcdTA5NjNcXHUwOTgxXFx1MDliY1xcdTA5YmVcXHUwOWMxLVxcdTA5YzRcXHUwOWNkXFx1MDlkN1xcdTA5ZTJcXHUwOWUzXFx1MGEwMVxcdTBhMDJcXHUwYTNjXFx1MGE0MVxcdTBhNDJcXHUwYTQ3XFx1MGE0OFxcdTBhNGItXFx1MGE0ZFxcdTBhNTFcXHUwYTcwXFx1MGE3MVxcdTBhNzVcXHUwYTgxXFx1MGE4MlxcdTBhYmNcXHUwYWMxLVxcdTBhYzVcXHUwYWM3XFx1MGFjOFxcdTBhY2RcXHUwYWUyXFx1MGFlM1xcdTBiMDFcXHUwYjNjXFx1MGIzZVxcdTBiM2ZcXHUwYjQxLVxcdTBiNDRcXHUwYjRkXFx1MGI1NlxcdTBiNTdcXHUwYjYyXFx1MGI2M1xcdTBiODJcXHUwYmJlXFx1MGJjMFxcdTBiY2RcXHUwYmQ3XFx1MGMzZS1cXHUwYzQwXFx1MGM0Ni1cXHUwYzQ4XFx1MGM0YS1cXHUwYzRkXFx1MGM1NVxcdTBjNTZcXHUwYzYyXFx1MGM2M1xcdTBjYmNcXHUwY2JmXFx1MGNjMlxcdTBjYzZcXHUwY2NjXFx1MGNjZFxcdTBjZDVcXHUwY2Q2XFx1MGNlMlxcdTBjZTNcXHUwZDNlXFx1MGQ0MS1cXHUwZDQ0XFx1MGQ0ZFxcdTBkNTdcXHUwZDYyXFx1MGQ2M1xcdTBkY2FcXHUwZGNmXFx1MGRkMi1cXHUwZGQ0XFx1MGRkNlxcdTBkZGZcXHUwZTMxXFx1MGUzNC1cXHUwZTNhXFx1MGU0Ny1cXHUwZTRlXFx1MGViMVxcdTBlYjQtXFx1MGViOVxcdTBlYmJcXHUwZWJjXFx1MGVjOC1cXHUwZWNkXFx1MGYxOFxcdTBmMTlcXHUwZjM1XFx1MGYzN1xcdTBmMzlcXHUwZjcxLVxcdTBmN2VcXHUwZjgwLVxcdTBmODRcXHUwZjg2XFx1MGY4N1xcdTBmOTAtXFx1MGY5N1xcdTBmOTktXFx1MGZiY1xcdTBmYzZcXHUxMDJkLVxcdTEwMzBcXHUxMDMyLVxcdTEwMzdcXHUxMDM5XFx1MTAzYVxcdTEwM2RcXHUxMDNlXFx1MTA1OFxcdTEwNTlcXHUxMDVlLVxcdTEwNjBcXHUxMDcxLVxcdTEwNzRcXHUxMDgyXFx1MTA4NVxcdTEwODZcXHUxMDhkXFx1MTA5ZFxcdTEzNWZcXHUxNzEyLVxcdTE3MTRcXHUxNzMyLVxcdTE3MzRcXHUxNzUyXFx1MTc1M1xcdTE3NzJcXHUxNzczXFx1MTdiNy1cXHUxN2JkXFx1MTdjNlxcdTE3YzktXFx1MTdkM1xcdTE3ZGRcXHUxODBiLVxcdTE4MGRcXHUxOGE5XFx1MTkyMC1cXHUxOTIyXFx1MTkyN1xcdTE5MjhcXHUxOTMyXFx1MTkzOS1cXHUxOTNiXFx1MWExN1xcdTFhMThcXHUxYTU2XFx1MWE1OC1cXHUxYTVlXFx1MWE2MFxcdTFhNjJcXHUxYTY1LVxcdTFhNmNcXHUxYTczLVxcdTFhN2NcXHUxYTdmXFx1MWIwMC1cXHUxYjAzXFx1MWIzNFxcdTFiMzYtXFx1MWIzYVxcdTFiM2NcXHUxYjQyXFx1MWI2Yi1cXHUxYjczXFx1MWI4MFxcdTFiODFcXHUxYmEyLVxcdTFiYTVcXHUxYmE4XFx1MWJhOVxcdTFjMmMtXFx1MWMzM1xcdTFjMzZcXHUxYzM3XFx1MWNkMC1cXHUxY2QyXFx1MWNkNC1cXHUxY2UwXFx1MWNlMi1cXHUxY2U4XFx1MWNlZFxcdTFkYzAtXFx1MWRlNlxcdTFkZmQtXFx1MWRmZlxcdTIwMGNcXHUyMDBkXFx1MjBkMC1cXHUyMGYwXFx1MmNlZi1cXHUyY2YxXFx1MmRlMC1cXHUyZGZmXFx1MzAyYS1cXHUzMDJmXFx1MzA5OVxcdTMwOWFcXHVhNjZmLVxcdWE2NzJcXHVhNjdjXFx1YTY3ZFxcdWE2ZjBcXHVhNmYxXFx1YTgwMlxcdWE4MDZcXHVhODBiXFx1YTgyNVxcdWE4MjZcXHVhOGM0XFx1YThlMC1cXHVhOGYxXFx1YTkyNi1cXHVhOTJkXFx1YTk0Ny1cXHVhOTUxXFx1YTk4MC1cXHVhOTgyXFx1YTliM1xcdWE5YjYtXFx1YTliOVxcdWE5YmNcXHVhYTI5LVxcdWFhMmVcXHVhYTMxXFx1YWEzMlxcdWFhMzVcXHVhYTM2XFx1YWE0M1xcdWFhNGNcXHVhYWIwXFx1YWFiMi1cXHVhYWI0XFx1YWFiN1xcdWFhYjhcXHVhYWJlXFx1YWFiZlxcdWFhYzFcXHVhYmU1XFx1YWJlOFxcdWFiZWRcXHVkYzAwLVxcdWRmZmZcXHVmYjFlXFx1ZmUwMC1cXHVmZTBmXFx1ZmUyMC1cXHVmZTI2XFx1ZmY5ZVxcdWZmOWZdLztcbiAgZnVuY3Rpb24gaXNFeHRlbmRpbmdDaGFyKGNoKSB7IHJldHVybiBjaC5jaGFyQ29kZUF0KDApID49IDc2OCAmJiBleHRlbmRpbmdDaGFycy50ZXN0KGNoKTsgfVxuXG4gIC8vIERPTSBVVElMSVRJRVNcblxuICBmdW5jdGlvbiBlbHQodGFnLCBjb250ZW50LCBjbGFzc05hbWUsIHN0eWxlKSB7XG4gICAgdmFyIGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZyk7XG4gICAgaWYgKGNsYXNzTmFtZSkgZS5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgaWYgKHN0eWxlKSBlLnN0eWxlLmNzc1RleHQgPSBzdHlsZTtcbiAgICBpZiAodHlwZW9mIGNvbnRlbnQgPT0gXCJzdHJpbmdcIikgZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShjb250ZW50KSk7XG4gICAgZWxzZSBpZiAoY29udGVudCkgZm9yICh2YXIgaSA9IDA7IGkgPCBjb250ZW50Lmxlbmd0aDsgKytpKSBlLmFwcGVuZENoaWxkKGNvbnRlbnRbaV0pO1xuICAgIHJldHVybiBlO1xuICB9XG5cbiAgdmFyIHJhbmdlO1xuICBpZiAoZG9jdW1lbnQuY3JlYXRlUmFuZ2UpIHJhbmdlID0gZnVuY3Rpb24obm9kZSwgc3RhcnQsIGVuZCwgZW5kTm9kZSkge1xuICAgIHZhciByID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgICByLnNldEVuZChlbmROb2RlIHx8IG5vZGUsIGVuZCk7XG4gICAgci5zZXRTdGFydChub2RlLCBzdGFydCk7XG4gICAgcmV0dXJuIHI7XG4gIH07XG4gIGVsc2UgcmFuZ2UgPSBmdW5jdGlvbihub2RlLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIHIgPSBkb2N1bWVudC5ib2R5LmNyZWF0ZVRleHRSYW5nZSgpO1xuICAgIHRyeSB7IHIubW92ZVRvRWxlbWVudFRleHQobm9kZS5wYXJlbnROb2RlKTsgfVxuICAgIGNhdGNoKGUpIHsgcmV0dXJuIHI7IH1cbiAgICByLmNvbGxhcHNlKHRydWUpO1xuICAgIHIubW92ZUVuZChcImNoYXJhY3RlclwiLCBlbmQpO1xuICAgIHIubW92ZVN0YXJ0KFwiY2hhcmFjdGVyXCIsIHN0YXJ0KTtcbiAgICByZXR1cm4gcjtcbiAgfTtcblxuICBmdW5jdGlvbiByZW1vdmVDaGlsZHJlbihlKSB7XG4gICAgZm9yICh2YXIgY291bnQgPSBlLmNoaWxkTm9kZXMubGVuZ3RoOyBjb3VudCA+IDA7IC0tY291bnQpXG4gICAgICBlLnJlbW92ZUNoaWxkKGUuZmlyc3RDaGlsZCk7XG4gICAgcmV0dXJuIGU7XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVDaGlsZHJlbkFuZEFkZChwYXJlbnQsIGUpIHtcbiAgICByZXR1cm4gcmVtb3ZlQ2hpbGRyZW4ocGFyZW50KS5hcHBlbmRDaGlsZChlKTtcbiAgfVxuXG4gIHZhciBjb250YWlucyA9IENvZGVNaXJyb3IuY29udGFpbnMgPSBmdW5jdGlvbihwYXJlbnQsIGNoaWxkKSB7XG4gICAgaWYgKGNoaWxkLm5vZGVUeXBlID09IDMpIC8vIEFuZHJvaWQgYnJvd3NlciBhbHdheXMgcmV0dXJucyBmYWxzZSB3aGVuIGNoaWxkIGlzIGEgdGV4dG5vZGVcbiAgICAgIGNoaWxkID0gY2hpbGQucGFyZW50Tm9kZTtcbiAgICBpZiAocGFyZW50LmNvbnRhaW5zKVxuICAgICAgcmV0dXJuIHBhcmVudC5jb250YWlucyhjaGlsZCk7XG4gICAgZG8ge1xuICAgICAgaWYgKGNoaWxkLm5vZGVUeXBlID09IDExKSBjaGlsZCA9IGNoaWxkLmhvc3Q7XG4gICAgICBpZiAoY2hpbGQgPT0gcGFyZW50KSByZXR1cm4gdHJ1ZTtcbiAgICB9IHdoaWxlIChjaGlsZCA9IGNoaWxkLnBhcmVudE5vZGUpO1xuICB9O1xuXG4gIGZ1bmN0aW9uIGFjdGl2ZUVsdCgpIHtcbiAgICB2YXIgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG4gICAgd2hpbGUgKGFjdGl2ZUVsZW1lbnQgJiYgYWN0aXZlRWxlbWVudC5yb290ICYmIGFjdGl2ZUVsZW1lbnQucm9vdC5hY3RpdmVFbGVtZW50KVxuICAgICAgYWN0aXZlRWxlbWVudCA9IGFjdGl2ZUVsZW1lbnQucm9vdC5hY3RpdmVFbGVtZW50O1xuICAgIHJldHVybiBhY3RpdmVFbGVtZW50O1xuICB9XG4gIC8vIE9sZGVyIHZlcnNpb25zIG9mIElFIHRocm93cyB1bnNwZWNpZmllZCBlcnJvciB3aGVuIHRvdWNoaW5nXG4gIC8vIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgaW4gc29tZSBjYXNlcyAoZHVyaW5nIGxvYWRpbmcsIGluIGlmcmFtZSlcbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCAxMSkgYWN0aXZlRWx0ID0gZnVuY3Rpb24oKSB7XG4gICAgdHJ5IHsgcmV0dXJuIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7IH1cbiAgICBjYXRjaChlKSB7IHJldHVybiBkb2N1bWVudC5ib2R5OyB9XG4gIH07XG5cbiAgZnVuY3Rpb24gY2xhc3NUZXN0KGNscykgeyByZXR1cm4gbmV3IFJlZ0V4cChcIihefFxcXFxzKVwiICsgY2xzICsgXCIoPzokfFxcXFxzKVxcXFxzKlwiKTsgfVxuICB2YXIgcm1DbGFzcyA9IENvZGVNaXJyb3Iucm1DbGFzcyA9IGZ1bmN0aW9uKG5vZGUsIGNscykge1xuICAgIHZhciBjdXJyZW50ID0gbm9kZS5jbGFzc05hbWU7XG4gICAgdmFyIG1hdGNoID0gY2xhc3NUZXN0KGNscykuZXhlYyhjdXJyZW50KTtcbiAgICBpZiAobWF0Y2gpIHtcbiAgICAgIHZhciBhZnRlciA9IGN1cnJlbnQuc2xpY2UobWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgpO1xuICAgICAgbm9kZS5jbGFzc05hbWUgPSBjdXJyZW50LnNsaWNlKDAsIG1hdGNoLmluZGV4KSArIChhZnRlciA/IG1hdGNoWzFdICsgYWZ0ZXIgOiBcIlwiKTtcbiAgICB9XG4gIH07XG4gIHZhciBhZGRDbGFzcyA9IENvZGVNaXJyb3IuYWRkQ2xhc3MgPSBmdW5jdGlvbihub2RlLCBjbHMpIHtcbiAgICB2YXIgY3VycmVudCA9IG5vZGUuY2xhc3NOYW1lO1xuICAgIGlmICghY2xhc3NUZXN0KGNscykudGVzdChjdXJyZW50KSkgbm9kZS5jbGFzc05hbWUgKz0gKGN1cnJlbnQgPyBcIiBcIiA6IFwiXCIpICsgY2xzO1xuICB9O1xuICBmdW5jdGlvbiBqb2luQ2xhc3NlcyhhLCBiKSB7XG4gICAgdmFyIGFzID0gYS5zcGxpdChcIiBcIik7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcy5sZW5ndGg7IGkrKylcbiAgICAgIGlmIChhc1tpXSAmJiAhY2xhc3NUZXN0KGFzW2ldKS50ZXN0KGIpKSBiICs9IFwiIFwiICsgYXNbaV07XG4gICAgcmV0dXJuIGI7XG4gIH1cblxuICAvLyBXSU5ET1ctV0lERSBFVkVOVFNcblxuICAvLyBUaGVzZSBtdXN0IGJlIGhhbmRsZWQgY2FyZWZ1bGx5LCBiZWNhdXNlIG5haXZlbHkgcmVnaXN0ZXJpbmcgYVxuICAvLyBoYW5kbGVyIGZvciBlYWNoIGVkaXRvciB3aWxsIGNhdXNlIHRoZSBlZGl0b3JzIHRvIG5ldmVyIGJlXG4gIC8vIGdhcmJhZ2UgY29sbGVjdGVkLlxuXG4gIGZ1bmN0aW9uIGZvckVhY2hDb2RlTWlycm9yKGYpIHtcbiAgICBpZiAoIWRvY3VtZW50LmJvZHkuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSkgcmV0dXJuO1xuICAgIHZhciBieUNsYXNzID0gZG9jdW1lbnQuYm9keS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFwiQ29kZU1pcnJvclwiKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5Q2xhc3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBjbSA9IGJ5Q2xhc3NbaV0uQ29kZU1pcnJvcjtcbiAgICAgIGlmIChjbSkgZihjbSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGdsb2JhbHNSZWdpc3RlcmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGVuc3VyZUdsb2JhbEhhbmRsZXJzKCkge1xuICAgIGlmIChnbG9iYWxzUmVnaXN0ZXJlZCkgcmV0dXJuO1xuICAgIHJlZ2lzdGVyR2xvYmFsSGFuZGxlcnMoKTtcbiAgICBnbG9iYWxzUmVnaXN0ZXJlZCA9IHRydWU7XG4gIH1cbiAgZnVuY3Rpb24gcmVnaXN0ZXJHbG9iYWxIYW5kbGVycygpIHtcbiAgICAvLyBXaGVuIHRoZSB3aW5kb3cgcmVzaXplcywgd2UgbmVlZCB0byByZWZyZXNoIGFjdGl2ZSBlZGl0b3JzLlxuICAgIHZhciByZXNpemVUaW1lcjtcbiAgICBvbih3aW5kb3csIFwicmVzaXplXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKHJlc2l6ZVRpbWVyID09IG51bGwpIHJlc2l6ZVRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzaXplVGltZXIgPSBudWxsO1xuICAgICAgICBmb3JFYWNoQ29kZU1pcnJvcihvblJlc2l6ZSk7XG4gICAgICB9LCAxMDApO1xuICAgIH0pO1xuICAgIC8vIFdoZW4gdGhlIHdpbmRvdyBsb3NlcyBmb2N1cywgd2Ugd2FudCB0byBzaG93IHRoZSBlZGl0b3IgYXMgYmx1cnJlZFxuICAgIG9uKHdpbmRvdywgXCJibHVyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgZm9yRWFjaENvZGVNaXJyb3Iob25CbHVyKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIEZFQVRVUkUgREVURUNUSU9OXG5cbiAgLy8gRGV0ZWN0IGRyYWctYW5kLWRyb3BcbiAgdmFyIGRyYWdBbmREcm9wID0gZnVuY3Rpb24oKSB7XG4gICAgLy8gVGhlcmUgaXMgKnNvbWUqIGtpbmQgb2YgZHJhZy1hbmQtZHJvcCBzdXBwb3J0IGluIElFNi04LCBidXQgSVxuICAgIC8vIGNvdWxkbid0IGdldCBpdCB0byB3b3JrIHlldC5cbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpIHJldHVybiBmYWxzZTtcbiAgICB2YXIgZGl2ID0gZWx0KCdkaXYnKTtcbiAgICByZXR1cm4gXCJkcmFnZ2FibGVcIiBpbiBkaXYgfHwgXCJkcmFnRHJvcFwiIGluIGRpdjtcbiAgfSgpO1xuXG4gIHZhciB6d3NwU3VwcG9ydGVkO1xuICBmdW5jdGlvbiB6ZXJvV2lkdGhFbGVtZW50KG1lYXN1cmUpIHtcbiAgICBpZiAoendzcFN1cHBvcnRlZCA9PSBudWxsKSB7XG4gICAgICB2YXIgdGVzdCA9IGVsdChcInNwYW5cIiwgXCJcXHUyMDBiXCIpO1xuICAgICAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQobWVhc3VyZSwgZWx0KFwic3BhblwiLCBbdGVzdCwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJ4XCIpXSkpO1xuICAgICAgaWYgKG1lYXN1cmUuZmlyc3RDaGlsZC5vZmZzZXRIZWlnaHQgIT0gMClcbiAgICAgICAgendzcFN1cHBvcnRlZCA9IHRlc3Qub2Zmc2V0V2lkdGggPD0gMSAmJiB0ZXN0Lm9mZnNldEhlaWdodCA+IDIgJiYgIShpZSAmJiBpZV92ZXJzaW9uIDwgOCk7XG4gICAgfVxuICAgIHZhciBub2RlID0gendzcFN1cHBvcnRlZCA/IGVsdChcInNwYW5cIiwgXCJcXHUyMDBiXCIpIDpcbiAgICAgIGVsdChcInNwYW5cIiwgXCJcXHUwMGEwXCIsIG51bGwsIFwiZGlzcGxheTogaW5saW5lLWJsb2NrOyB3aWR0aDogMXB4OyBtYXJnaW4tcmlnaHQ6IC0xcHhcIik7XG4gICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIFwiXCIpO1xuICAgIHJldHVybiBub2RlO1xuICB9XG5cbiAgLy8gRmVhdHVyZS1kZXRlY3QgSUUncyBjcnVtbXkgY2xpZW50IHJlY3QgcmVwb3J0aW5nIGZvciBiaWRpIHRleHRcbiAgdmFyIGJhZEJpZGlSZWN0cztcbiAgZnVuY3Rpb24gaGFzQmFkQmlkaVJlY3RzKG1lYXN1cmUpIHtcbiAgICBpZiAoYmFkQmlkaVJlY3RzICE9IG51bGwpIHJldHVybiBiYWRCaWRpUmVjdHM7XG4gICAgdmFyIHR4dCA9IHJlbW92ZUNoaWxkcmVuQW5kQWRkKG1lYXN1cmUsIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiQVxcdTA2MmVBXCIpKTtcbiAgICB2YXIgcjAgPSByYW5nZSh0eHQsIDAsIDEpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGlmICghcjAgfHwgcjAubGVmdCA9PSByMC5yaWdodCkgcmV0dXJuIGZhbHNlOyAvLyBTYWZhcmkgcmV0dXJucyBudWxsIGluIHNvbWUgY2FzZXMgKCMyNzgwKVxuICAgIHZhciByMSA9IHJhbmdlKHR4dCwgMSwgMikuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgcmV0dXJuIGJhZEJpZGlSZWN0cyA9IChyMS5yaWdodCAtIHIwLnJpZ2h0IDwgMyk7XG4gIH1cblxuICAvLyBTZWUgaWYgXCJcIi5zcGxpdCBpcyB0aGUgYnJva2VuIElFIHZlcnNpb24sIGlmIHNvLCBwcm92aWRlIGFuXG4gIC8vIGFsdGVybmF0aXZlIHdheSB0byBzcGxpdCBsaW5lcy5cbiAgdmFyIHNwbGl0TGluZXNBdXRvID0gQ29kZU1pcnJvci5zcGxpdExpbmVzID0gXCJcXG5cXG5iXCIuc3BsaXQoL1xcbi8pLmxlbmd0aCAhPSAzID8gZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgdmFyIHBvcyA9IDAsIHJlc3VsdCA9IFtdLCBsID0gc3RyaW5nLmxlbmd0aDtcbiAgICB3aGlsZSAocG9zIDw9IGwpIHtcbiAgICAgIHZhciBubCA9IHN0cmluZy5pbmRleE9mKFwiXFxuXCIsIHBvcyk7XG4gICAgICBpZiAobmwgPT0gLTEpIG5sID0gc3RyaW5nLmxlbmd0aDtcbiAgICAgIHZhciBsaW5lID0gc3RyaW5nLnNsaWNlKHBvcywgc3RyaW5nLmNoYXJBdChubCAtIDEpID09IFwiXFxyXCIgPyBubCAtIDEgOiBubCk7XG4gICAgICB2YXIgcnQgPSBsaW5lLmluZGV4T2YoXCJcXHJcIik7XG4gICAgICBpZiAocnQgIT0gLTEpIHtcbiAgICAgICAgcmVzdWx0LnB1c2gobGluZS5zbGljZSgwLCBydCkpO1xuICAgICAgICBwb3MgKz0gcnQgKyAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0LnB1c2gobGluZSk7XG4gICAgICAgIHBvcyA9IG5sICsgMTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSA6IGZ1bmN0aW9uKHN0cmluZyl7cmV0dXJuIHN0cmluZy5zcGxpdCgvXFxyXFxuP3xcXG4vKTt9O1xuXG4gIHZhciBoYXNTZWxlY3Rpb24gPSB3aW5kb3cuZ2V0U2VsZWN0aW9uID8gZnVuY3Rpb24odGUpIHtcbiAgICB0cnkgeyByZXR1cm4gdGUuc2VsZWN0aW9uU3RhcnQgIT0gdGUuc2VsZWN0aW9uRW5kOyB9XG4gICAgY2F0Y2goZSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgfSA6IGZ1bmN0aW9uKHRlKSB7XG4gICAgdHJ5IHt2YXIgcmFuZ2UgPSB0ZS5vd25lckRvY3VtZW50LnNlbGVjdGlvbi5jcmVhdGVSYW5nZSgpO31cbiAgICBjYXRjaChlKSB7fVxuICAgIGlmICghcmFuZ2UgfHwgcmFuZ2UucGFyZW50RWxlbWVudCgpICE9IHRlKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHJhbmdlLmNvbXBhcmVFbmRQb2ludHMoXCJTdGFydFRvRW5kXCIsIHJhbmdlKSAhPSAwO1xuICB9O1xuXG4gIHZhciBoYXNDb3B5RXZlbnQgPSAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIGUgPSBlbHQoXCJkaXZcIik7XG4gICAgaWYgKFwib25jb3B5XCIgaW4gZSkgcmV0dXJuIHRydWU7XG4gICAgZS5zZXRBdHRyaWJ1dGUoXCJvbmNvcHlcIiwgXCJyZXR1cm47XCIpO1xuICAgIHJldHVybiB0eXBlb2YgZS5vbmNvcHkgPT0gXCJmdW5jdGlvblwiO1xuICB9KSgpO1xuXG4gIHZhciBiYWRab29tZWRSZWN0cyA9IG51bGw7XG4gIGZ1bmN0aW9uIGhhc0JhZFpvb21lZFJlY3RzKG1lYXN1cmUpIHtcbiAgICBpZiAoYmFkWm9vbWVkUmVjdHMgIT0gbnVsbCkgcmV0dXJuIGJhZFpvb21lZFJlY3RzO1xuICAgIHZhciBub2RlID0gcmVtb3ZlQ2hpbGRyZW5BbmRBZGQobWVhc3VyZSwgZWx0KFwic3BhblwiLCBcInhcIikpO1xuICAgIHZhciBub3JtYWwgPSBub2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHZhciBmcm9tUmFuZ2UgPSByYW5nZShub2RlLCAwLCAxKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICByZXR1cm4gYmFkWm9vbWVkUmVjdHMgPSBNYXRoLmFicyhub3JtYWwubGVmdCAtIGZyb21SYW5nZS5sZWZ0KSA+IDE7XG4gIH1cblxuICAvLyBLRVkgTkFNRVNcblxuICB2YXIga2V5TmFtZXMgPSBDb2RlTWlycm9yLmtleU5hbWVzID0ge1xuICAgIDM6IFwiRW50ZXJcIiwgODogXCJCYWNrc3BhY2VcIiwgOTogXCJUYWJcIiwgMTM6IFwiRW50ZXJcIiwgMTY6IFwiU2hpZnRcIiwgMTc6IFwiQ3RybFwiLCAxODogXCJBbHRcIixcbiAgICAxOTogXCJQYXVzZVwiLCAyMDogXCJDYXBzTG9ja1wiLCAyNzogXCJFc2NcIiwgMzI6IFwiU3BhY2VcIiwgMzM6IFwiUGFnZVVwXCIsIDM0OiBcIlBhZ2VEb3duXCIsIDM1OiBcIkVuZFwiLFxuICAgIDM2OiBcIkhvbWVcIiwgMzc6IFwiTGVmdFwiLCAzODogXCJVcFwiLCAzOTogXCJSaWdodFwiLCA0MDogXCJEb3duXCIsIDQ0OiBcIlByaW50U2NyblwiLCA0NTogXCJJbnNlcnRcIixcbiAgICA0NjogXCJEZWxldGVcIiwgNTk6IFwiO1wiLCA2MTogXCI9XCIsIDkxOiBcIk1vZFwiLCA5MjogXCJNb2RcIiwgOTM6IFwiTW9kXCIsXG4gICAgMTA2OiBcIipcIiwgMTA3OiBcIj1cIiwgMTA5OiBcIi1cIiwgMTEwOiBcIi5cIiwgMTExOiBcIi9cIiwgMTI3OiBcIkRlbGV0ZVwiLFxuICAgIDE3MzogXCItXCIsIDE4NjogXCI7XCIsIDE4NzogXCI9XCIsIDE4ODogXCIsXCIsIDE4OTogXCItXCIsIDE5MDogXCIuXCIsIDE5MTogXCIvXCIsIDE5MjogXCJgXCIsIDIxOTogXCJbXCIsIDIyMDogXCJcXFxcXCIsXG4gICAgMjIxOiBcIl1cIiwgMjIyOiBcIidcIiwgNjMyMzI6IFwiVXBcIiwgNjMyMzM6IFwiRG93blwiLCA2MzIzNDogXCJMZWZ0XCIsIDYzMjM1OiBcIlJpZ2h0XCIsIDYzMjcyOiBcIkRlbGV0ZVwiLFxuICAgIDYzMjczOiBcIkhvbWVcIiwgNjMyNzU6IFwiRW5kXCIsIDYzMjc2OiBcIlBhZ2VVcFwiLCA2MzI3NzogXCJQYWdlRG93blwiLCA2MzMwMjogXCJJbnNlcnRcIlxuICB9O1xuICAoZnVuY3Rpb24oKSB7XG4gICAgLy8gTnVtYmVyIGtleXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDEwOyBpKyspIGtleU5hbWVzW2kgKyA0OF0gPSBrZXlOYW1lc1tpICsgOTZdID0gU3RyaW5nKGkpO1xuICAgIC8vIEFscGhhYmV0aWMga2V5c1xuICAgIGZvciAodmFyIGkgPSA2NTsgaSA8PSA5MDsgaSsrKSBrZXlOYW1lc1tpXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoaSk7XG4gICAgLy8gRnVuY3Rpb24ga2V5c1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDw9IDEyOyBpKyspIGtleU5hbWVzW2kgKyAxMTFdID0ga2V5TmFtZXNbaSArIDYzMjM1XSA9IFwiRlwiICsgaTtcbiAgfSkoKTtcblxuICAvLyBCSURJIEhFTFBFUlNcblxuICBmdW5jdGlvbiBpdGVyYXRlQmlkaVNlY3Rpb25zKG9yZGVyLCBmcm9tLCB0bywgZikge1xuICAgIGlmICghb3JkZXIpIHJldHVybiBmKGZyb20sIHRvLCBcImx0clwiKTtcbiAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9yZGVyLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgcGFydCA9IG9yZGVyW2ldO1xuICAgICAgaWYgKHBhcnQuZnJvbSA8IHRvICYmIHBhcnQudG8gPiBmcm9tIHx8IGZyb20gPT0gdG8gJiYgcGFydC50byA9PSBmcm9tKSB7XG4gICAgICAgIGYoTWF0aC5tYXgocGFydC5mcm9tLCBmcm9tKSwgTWF0aC5taW4ocGFydC50bywgdG8pLCBwYXJ0LmxldmVsID09IDEgPyBcInJ0bFwiIDogXCJsdHJcIik7XG4gICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFmb3VuZCkgZihmcm9tLCB0bywgXCJsdHJcIik7XG4gIH1cblxuICBmdW5jdGlvbiBiaWRpTGVmdChwYXJ0KSB7IHJldHVybiBwYXJ0LmxldmVsICUgMiA/IHBhcnQudG8gOiBwYXJ0LmZyb207IH1cbiAgZnVuY3Rpb24gYmlkaVJpZ2h0KHBhcnQpIHsgcmV0dXJuIHBhcnQubGV2ZWwgJSAyID8gcGFydC5mcm9tIDogcGFydC50bzsgfVxuXG4gIGZ1bmN0aW9uIGxpbmVMZWZ0KGxpbmUpIHsgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZSk7IHJldHVybiBvcmRlciA/IGJpZGlMZWZ0KG9yZGVyWzBdKSA6IDA7IH1cbiAgZnVuY3Rpb24gbGluZVJpZ2h0KGxpbmUpIHtcbiAgICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lKTtcbiAgICBpZiAoIW9yZGVyKSByZXR1cm4gbGluZS50ZXh0Lmxlbmd0aDtcbiAgICByZXR1cm4gYmlkaVJpZ2h0KGxzdChvcmRlcikpO1xuICB9XG5cbiAgZnVuY3Rpb24gbGluZVN0YXJ0KGNtLCBsaW5lTikge1xuICAgIHZhciBsaW5lID0gZ2V0TGluZShjbS5kb2MsIGxpbmVOKTtcbiAgICB2YXIgdmlzdWFsID0gdmlzdWFsTGluZShsaW5lKTtcbiAgICBpZiAodmlzdWFsICE9IGxpbmUpIGxpbmVOID0gbGluZU5vKHZpc3VhbCk7XG4gICAgdmFyIG9yZGVyID0gZ2V0T3JkZXIodmlzdWFsKTtcbiAgICB2YXIgY2ggPSAhb3JkZXIgPyAwIDogb3JkZXJbMF0ubGV2ZWwgJSAyID8gbGluZVJpZ2h0KHZpc3VhbCkgOiBsaW5lTGVmdCh2aXN1YWwpO1xuICAgIHJldHVybiBQb3MobGluZU4sIGNoKTtcbiAgfVxuICBmdW5jdGlvbiBsaW5lRW5kKGNtLCBsaW5lTikge1xuICAgIHZhciBtZXJnZWQsIGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgbGluZU4pO1xuICAgIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRFbmQobGluZSkpIHtcbiAgICAgIGxpbmUgPSBtZXJnZWQuZmluZCgxLCB0cnVlKS5saW5lO1xuICAgICAgbGluZU4gPSBudWxsO1xuICAgIH1cbiAgICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lKTtcbiAgICB2YXIgY2ggPSAhb3JkZXIgPyBsaW5lLnRleHQubGVuZ3RoIDogb3JkZXJbMF0ubGV2ZWwgJSAyID8gbGluZUxlZnQobGluZSkgOiBsaW5lUmlnaHQobGluZSk7XG4gICAgcmV0dXJuIFBvcyhsaW5lTiA9PSBudWxsID8gbGluZU5vKGxpbmUpIDogbGluZU4sIGNoKTtcbiAgfVxuICBmdW5jdGlvbiBsaW5lU3RhcnRTbWFydChjbSwgcG9zKSB7XG4gICAgdmFyIHN0YXJ0ID0gbGluZVN0YXJ0KGNtLCBwb3MubGluZSk7XG4gICAgdmFyIGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgc3RhcnQubGluZSk7XG4gICAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZSk7XG4gICAgaWYgKCFvcmRlciB8fCBvcmRlclswXS5sZXZlbCA9PSAwKSB7XG4gICAgICB2YXIgZmlyc3ROb25XUyA9IE1hdGgubWF4KDAsIGxpbmUudGV4dC5zZWFyY2goL1xcUy8pKTtcbiAgICAgIHZhciBpbldTID0gcG9zLmxpbmUgPT0gc3RhcnQubGluZSAmJiBwb3MuY2ggPD0gZmlyc3ROb25XUyAmJiBwb3MuY2g7XG4gICAgICByZXR1cm4gUG9zKHN0YXJ0LmxpbmUsIGluV1MgPyAwIDogZmlyc3ROb25XUyk7XG4gICAgfVxuICAgIHJldHVybiBzdGFydDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbXBhcmVCaWRpTGV2ZWwob3JkZXIsIGEsIGIpIHtcbiAgICB2YXIgbGluZWRpciA9IG9yZGVyWzBdLmxldmVsO1xuICAgIGlmIChhID09IGxpbmVkaXIpIHJldHVybiB0cnVlO1xuICAgIGlmIChiID09IGxpbmVkaXIpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYSA8IGI7XG4gIH1cbiAgdmFyIGJpZGlPdGhlcjtcbiAgZnVuY3Rpb24gZ2V0QmlkaVBhcnRBdChvcmRlciwgcG9zKSB7XG4gICAgYmlkaU90aGVyID0gbnVsbDtcbiAgICBmb3IgKHZhciBpID0gMCwgZm91bmQ7IGkgPCBvcmRlci5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGN1ciA9IG9yZGVyW2ldO1xuICAgICAgaWYgKGN1ci5mcm9tIDwgcG9zICYmIGN1ci50byA+IHBvcykgcmV0dXJuIGk7XG4gICAgICBpZiAoKGN1ci5mcm9tID09IHBvcyB8fCBjdXIudG8gPT0gcG9zKSkge1xuICAgICAgICBpZiAoZm91bmQgPT0gbnVsbCkge1xuICAgICAgICAgIGZvdW5kID0gaTtcbiAgICAgICAgfSBlbHNlIGlmIChjb21wYXJlQmlkaUxldmVsKG9yZGVyLCBjdXIubGV2ZWwsIG9yZGVyW2ZvdW5kXS5sZXZlbCkpIHtcbiAgICAgICAgICBpZiAoY3VyLmZyb20gIT0gY3VyLnRvKSBiaWRpT3RoZXIgPSBmb3VuZDtcbiAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoY3VyLmZyb20gIT0gY3VyLnRvKSBiaWRpT3RoZXIgPSBpO1xuICAgICAgICAgIHJldHVybiBmb3VuZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZm91bmQ7XG4gIH1cblxuICBmdW5jdGlvbiBtb3ZlSW5MaW5lKGxpbmUsIHBvcywgZGlyLCBieVVuaXQpIHtcbiAgICBpZiAoIWJ5VW5pdCkgcmV0dXJuIHBvcyArIGRpcjtcbiAgICBkbyBwb3MgKz0gZGlyO1xuICAgIHdoaWxlIChwb3MgPiAwICYmIGlzRXh0ZW5kaW5nQ2hhcihsaW5lLnRleHQuY2hhckF0KHBvcykpKTtcbiAgICByZXR1cm4gcG9zO1xuICB9XG5cbiAgLy8gVGhpcyBpcyBuZWVkZWQgaW4gb3JkZXIgdG8gbW92ZSAndmlzdWFsbHknIHRocm91Z2ggYmktZGlyZWN0aW9uYWxcbiAgLy8gdGV4dCAtLSBpLmUuLCBwcmVzc2luZyBsZWZ0IHNob3VsZCBtYWtlIHRoZSBjdXJzb3IgZ28gbGVmdCwgZXZlblxuICAvLyB3aGVuIGluIFJUTCB0ZXh0LiBUaGUgdHJpY2t5IHBhcnQgaXMgdGhlICdqdW1wcycsIHdoZXJlIFJUTCBhbmRcbiAgLy8gTFRSIHRleHQgdG91Y2ggZWFjaCBvdGhlci4gVGhpcyBvZnRlbiByZXF1aXJlcyB0aGUgY3Vyc29yIG9mZnNldFxuICAvLyB0byBtb3ZlIG1vcmUgdGhhbiBvbmUgdW5pdCwgaW4gb3JkZXIgdG8gdmlzdWFsbHkgbW92ZSBvbmUgdW5pdC5cbiAgZnVuY3Rpb24gbW92ZVZpc3VhbGx5KGxpbmUsIHN0YXJ0LCBkaXIsIGJ5VW5pdCkge1xuICAgIHZhciBiaWRpID0gZ2V0T3JkZXIobGluZSk7XG4gICAgaWYgKCFiaWRpKSByZXR1cm4gbW92ZUxvZ2ljYWxseShsaW5lLCBzdGFydCwgZGlyLCBieVVuaXQpO1xuICAgIHZhciBwb3MgPSBnZXRCaWRpUGFydEF0KGJpZGksIHN0YXJ0KSwgcGFydCA9IGJpZGlbcG9zXTtcbiAgICB2YXIgdGFyZ2V0ID0gbW92ZUluTGluZShsaW5lLCBzdGFydCwgcGFydC5sZXZlbCAlIDIgPyAtZGlyIDogZGlyLCBieVVuaXQpO1xuXG4gICAgZm9yICg7Oykge1xuICAgICAgaWYgKHRhcmdldCA+IHBhcnQuZnJvbSAmJiB0YXJnZXQgPCBwYXJ0LnRvKSByZXR1cm4gdGFyZ2V0O1xuICAgICAgaWYgKHRhcmdldCA9PSBwYXJ0LmZyb20gfHwgdGFyZ2V0ID09IHBhcnQudG8pIHtcbiAgICAgICAgaWYgKGdldEJpZGlQYXJ0QXQoYmlkaSwgdGFyZ2V0KSA9PSBwb3MpIHJldHVybiB0YXJnZXQ7XG4gICAgICAgIHBhcnQgPSBiaWRpW3BvcyArPSBkaXJdO1xuICAgICAgICByZXR1cm4gKGRpciA+IDApID09IHBhcnQubGV2ZWwgJSAyID8gcGFydC50byA6IHBhcnQuZnJvbTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhcnQgPSBiaWRpW3BvcyArPSBkaXJdO1xuICAgICAgICBpZiAoIXBhcnQpIHJldHVybiBudWxsO1xuICAgICAgICBpZiAoKGRpciA+IDApID09IHBhcnQubGV2ZWwgJSAyKVxuICAgICAgICAgIHRhcmdldCA9IG1vdmVJbkxpbmUobGluZSwgcGFydC50bywgLTEsIGJ5VW5pdCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICB0YXJnZXQgPSBtb3ZlSW5MaW5lKGxpbmUsIHBhcnQuZnJvbSwgMSwgYnlVbml0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBtb3ZlTG9naWNhbGx5KGxpbmUsIHN0YXJ0LCBkaXIsIGJ5VW5pdCkge1xuICAgIHZhciB0YXJnZXQgPSBzdGFydCArIGRpcjtcbiAgICBpZiAoYnlVbml0KSB3aGlsZSAodGFyZ2V0ID4gMCAmJiBpc0V4dGVuZGluZ0NoYXIobGluZS50ZXh0LmNoYXJBdCh0YXJnZXQpKSkgdGFyZ2V0ICs9IGRpcjtcbiAgICByZXR1cm4gdGFyZ2V0IDwgMCB8fCB0YXJnZXQgPiBsaW5lLnRleHQubGVuZ3RoID8gbnVsbCA6IHRhcmdldDtcbiAgfVxuXG4gIC8vIEJpZGlyZWN0aW9uYWwgb3JkZXJpbmcgYWxnb3JpdGhtXG4gIC8vIFNlZSBodHRwOi8vdW5pY29kZS5vcmcvcmVwb3J0cy90cjkvdHI5LTEzLmh0bWwgZm9yIHRoZSBhbGdvcml0aG1cbiAgLy8gdGhhdCB0aGlzIChwYXJ0aWFsbHkpIGltcGxlbWVudHMuXG5cbiAgLy8gT25lLWNoYXIgY29kZXMgdXNlZCBmb3IgY2hhcmFjdGVyIHR5cGVzOlxuICAvLyBMIChMKTogICBMZWZ0LXRvLVJpZ2h0XG4gIC8vIFIgKFIpOiAgIFJpZ2h0LXRvLUxlZnRcbiAgLy8gciAoQUwpOiAgUmlnaHQtdG8tTGVmdCBBcmFiaWNcbiAgLy8gMSAoRU4pOiAgRXVyb3BlYW4gTnVtYmVyXG4gIC8vICsgKEVTKTogIEV1cm9wZWFuIE51bWJlciBTZXBhcmF0b3JcbiAgLy8gJSAoRVQpOiAgRXVyb3BlYW4gTnVtYmVyIFRlcm1pbmF0b3JcbiAgLy8gbiAoQU4pOiAgQXJhYmljIE51bWJlclxuICAvLyAsIChDUyk6ICBDb21tb24gTnVtYmVyIFNlcGFyYXRvclxuICAvLyBtIChOU00pOiBOb24tU3BhY2luZyBNYXJrXG4gIC8vIGIgKEJOKTogIEJvdW5kYXJ5IE5ldXRyYWxcbiAgLy8gcyAoQik6ICAgUGFyYWdyYXBoIFNlcGFyYXRvclxuICAvLyB0IChTKTogICBTZWdtZW50IFNlcGFyYXRvclxuICAvLyB3IChXUyk6ICBXaGl0ZXNwYWNlXG4gIC8vIE4gKE9OKTogIE90aGVyIE5ldXRyYWxzXG5cbiAgLy8gUmV0dXJucyBudWxsIGlmIGNoYXJhY3RlcnMgYXJlIG9yZGVyZWQgYXMgdGhleSBhcHBlYXJcbiAgLy8gKGxlZnQtdG8tcmlnaHQpLCBvciBhbiBhcnJheSBvZiBzZWN0aW9ucyAoe2Zyb20sIHRvLCBsZXZlbH1cbiAgLy8gb2JqZWN0cykgaW4gdGhlIG9yZGVyIGluIHdoaWNoIHRoZXkgb2NjdXIgdmlzdWFsbHkuXG4gIHZhciBiaWRpT3JkZXJpbmcgPSAoZnVuY3Rpb24oKSB7XG4gICAgLy8gQ2hhcmFjdGVyIHR5cGVzIGZvciBjb2RlcG9pbnRzIDAgdG8gMHhmZlxuICAgIHZhciBsb3dUeXBlcyA9IFwiYmJiYmJiYmJidHN0d3NiYmJiYmJiYmJiYmJiYnNzc3R3Tk4lJSVOTk5OTk4sTixOMTExMTExMTExMU5OTk5OTk5MTExMTExMTExMTExMTExMTExMTExMTExMTE5OTk5OTkxMTExMTExMTExMTExMTExMTExMTExMTExMTk5OTmJiYmJiYnNiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYixOJSUlJU5OTk5MTk5OTk4lJTExTkxOTk4xTE5OTk5OTExMTExMTExMTExMTExMTExMTExMTExOTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE5cIjtcbiAgICAvLyBDaGFyYWN0ZXIgdHlwZXMgZm9yIGNvZGVwb2ludHMgMHg2MDAgdG8gMHg2ZmZcbiAgICB2YXIgYXJhYmljVHlwZXMgPSBcInJycnJycnJycnJycixyTk5tbW1tbW1ycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycm1tbW1tbW1tbW1tbW1tcnJycnJycm5ubm5ubm5ubm4lbm5ycnJtcnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJtbW1tbW1tbW1tbW1tbW1tbW1tTm1tbW1cIjtcbiAgICBmdW5jdGlvbiBjaGFyVHlwZShjb2RlKSB7XG4gICAgICBpZiAoY29kZSA8PSAweGY3KSByZXR1cm4gbG93VHlwZXMuY2hhckF0KGNvZGUpO1xuICAgICAgZWxzZSBpZiAoMHg1OTAgPD0gY29kZSAmJiBjb2RlIDw9IDB4NWY0KSByZXR1cm4gXCJSXCI7XG4gICAgICBlbHNlIGlmICgweDYwMCA8PSBjb2RlICYmIGNvZGUgPD0gMHg2ZWQpIHJldHVybiBhcmFiaWNUeXBlcy5jaGFyQXQoY29kZSAtIDB4NjAwKTtcbiAgICAgIGVsc2UgaWYgKDB4NmVlIDw9IGNvZGUgJiYgY29kZSA8PSAweDhhYykgcmV0dXJuIFwiclwiO1xuICAgICAgZWxzZSBpZiAoMHgyMDAwIDw9IGNvZGUgJiYgY29kZSA8PSAweDIwMGIpIHJldHVybiBcIndcIjtcbiAgICAgIGVsc2UgaWYgKGNvZGUgPT0gMHgyMDBjKSByZXR1cm4gXCJiXCI7XG4gICAgICBlbHNlIHJldHVybiBcIkxcIjtcbiAgICB9XG5cbiAgICB2YXIgYmlkaVJFID0gL1tcXHUwNTkwLVxcdTA1ZjRcXHUwNjAwLVxcdTA2ZmZcXHUwNzAwLVxcdTA4YWNdLztcbiAgICB2YXIgaXNOZXV0cmFsID0gL1tzdHdOXS8sIGlzU3Ryb25nID0gL1tMUnJdLywgY291bnRzQXNMZWZ0ID0gL1tMYjFuXS8sIGNvdW50c0FzTnVtID0gL1sxbl0vO1xuICAgIC8vIEJyb3dzZXJzIHNlZW0gdG8gYWx3YXlzIHRyZWF0IHRoZSBib3VuZGFyaWVzIG9mIGJsb2NrIGVsZW1lbnRzIGFzIGJlaW5nIEwuXG4gICAgdmFyIG91dGVyVHlwZSA9IFwiTFwiO1xuXG4gICAgZnVuY3Rpb24gQmlkaVNwYW4obGV2ZWwsIGZyb20sIHRvKSB7XG4gICAgICB0aGlzLmxldmVsID0gbGV2ZWw7XG4gICAgICB0aGlzLmZyb20gPSBmcm9tOyB0aGlzLnRvID0gdG87XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHN0cikge1xuICAgICAgaWYgKCFiaWRpUkUudGVzdChzdHIpKSByZXR1cm4gZmFsc2U7XG4gICAgICB2YXIgbGVuID0gc3RyLmxlbmd0aCwgdHlwZXMgPSBbXTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCB0eXBlOyBpIDwgbGVuOyArK2kpXG4gICAgICAgIHR5cGVzLnB1c2godHlwZSA9IGNoYXJUeXBlKHN0ci5jaGFyQ29kZUF0KGkpKSk7XG5cbiAgICAgIC8vIFcxLiBFeGFtaW5lIGVhY2ggbm9uLXNwYWNpbmcgbWFyayAoTlNNKSBpbiB0aGUgbGV2ZWwgcnVuLCBhbmRcbiAgICAgIC8vIGNoYW5nZSB0aGUgdHlwZSBvZiB0aGUgTlNNIHRvIHRoZSB0eXBlIG9mIHRoZSBwcmV2aW91c1xuICAgICAgLy8gY2hhcmFjdGVyLiBJZiB0aGUgTlNNIGlzIGF0IHRoZSBzdGFydCBvZiB0aGUgbGV2ZWwgcnVuLCBpdCB3aWxsXG4gICAgICAvLyBnZXQgdGhlIHR5cGUgb2Ygc29yLlxuICAgICAgZm9yICh2YXIgaSA9IDAsIHByZXYgPSBvdXRlclR5cGU7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgdHlwZSA9IHR5cGVzW2ldO1xuICAgICAgICBpZiAodHlwZSA9PSBcIm1cIikgdHlwZXNbaV0gPSBwcmV2O1xuICAgICAgICBlbHNlIHByZXYgPSB0eXBlO1xuICAgICAgfVxuXG4gICAgICAvLyBXMi4gU2VhcmNoIGJhY2t3YXJkcyBmcm9tIGVhY2ggaW5zdGFuY2Ugb2YgYSBFdXJvcGVhbiBudW1iZXJcbiAgICAgIC8vIHVudGlsIHRoZSBmaXJzdCBzdHJvbmcgdHlwZSAoUiwgTCwgQUwsIG9yIHNvcikgaXMgZm91bmQuIElmIGFuXG4gICAgICAvLyBBTCBpcyBmb3VuZCwgY2hhbmdlIHRoZSB0eXBlIG9mIHRoZSBFdXJvcGVhbiBudW1iZXIgdG8gQXJhYmljXG4gICAgICAvLyBudW1iZXIuXG4gICAgICAvLyBXMy4gQ2hhbmdlIGFsbCBBTHMgdG8gUi5cbiAgICAgIGZvciAodmFyIGkgPSAwLCBjdXIgPSBvdXRlclR5cGU7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgdHlwZSA9IHR5cGVzW2ldO1xuICAgICAgICBpZiAodHlwZSA9PSBcIjFcIiAmJiBjdXIgPT0gXCJyXCIpIHR5cGVzW2ldID0gXCJuXCI7XG4gICAgICAgIGVsc2UgaWYgKGlzU3Ryb25nLnRlc3QodHlwZSkpIHsgY3VyID0gdHlwZTsgaWYgKHR5cGUgPT0gXCJyXCIpIHR5cGVzW2ldID0gXCJSXCI7IH1cbiAgICAgIH1cblxuICAgICAgLy8gVzQuIEEgc2luZ2xlIEV1cm9wZWFuIHNlcGFyYXRvciBiZXR3ZWVuIHR3byBFdXJvcGVhbiBudW1iZXJzXG4gICAgICAvLyBjaGFuZ2VzIHRvIGEgRXVyb3BlYW4gbnVtYmVyLiBBIHNpbmdsZSBjb21tb24gc2VwYXJhdG9yIGJldHdlZW5cbiAgICAgIC8vIHR3byBudW1iZXJzIG9mIHRoZSBzYW1lIHR5cGUgY2hhbmdlcyB0byB0aGF0IHR5cGUuXG4gICAgICBmb3IgKHZhciBpID0gMSwgcHJldiA9IHR5cGVzWzBdOyBpIDwgbGVuIC0gMTsgKytpKSB7XG4gICAgICAgIHZhciB0eXBlID0gdHlwZXNbaV07XG4gICAgICAgIGlmICh0eXBlID09IFwiK1wiICYmIHByZXYgPT0gXCIxXCIgJiYgdHlwZXNbaSsxXSA9PSBcIjFcIikgdHlwZXNbaV0gPSBcIjFcIjtcbiAgICAgICAgZWxzZSBpZiAodHlwZSA9PSBcIixcIiAmJiBwcmV2ID09IHR5cGVzW2krMV0gJiZcbiAgICAgICAgICAgICAgICAgKHByZXYgPT0gXCIxXCIgfHwgcHJldiA9PSBcIm5cIikpIHR5cGVzW2ldID0gcHJldjtcbiAgICAgICAgcHJldiA9IHR5cGU7XG4gICAgICB9XG5cbiAgICAgIC8vIFc1LiBBIHNlcXVlbmNlIG9mIEV1cm9wZWFuIHRlcm1pbmF0b3JzIGFkamFjZW50IHRvIEV1cm9wZWFuXG4gICAgICAvLyBudW1iZXJzIGNoYW5nZXMgdG8gYWxsIEV1cm9wZWFuIG51bWJlcnMuXG4gICAgICAvLyBXNi4gT3RoZXJ3aXNlLCBzZXBhcmF0b3JzIGFuZCB0ZXJtaW5hdG9ycyBjaGFuZ2UgdG8gT3RoZXJcbiAgICAgIC8vIE5ldXRyYWwuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciB0eXBlID0gdHlwZXNbaV07XG4gICAgICAgIGlmICh0eXBlID09IFwiLFwiKSB0eXBlc1tpXSA9IFwiTlwiO1xuICAgICAgICBlbHNlIGlmICh0eXBlID09IFwiJVwiKSB7XG4gICAgICAgICAgZm9yICh2YXIgZW5kID0gaSArIDE7IGVuZCA8IGxlbiAmJiB0eXBlc1tlbmRdID09IFwiJVwiOyArK2VuZCkge31cbiAgICAgICAgICB2YXIgcmVwbGFjZSA9IChpICYmIHR5cGVzW2ktMV0gPT0gXCIhXCIpIHx8IChlbmQgPCBsZW4gJiYgdHlwZXNbZW5kXSA9PSBcIjFcIikgPyBcIjFcIiA6IFwiTlwiO1xuICAgICAgICAgIGZvciAodmFyIGogPSBpOyBqIDwgZW5kOyArK2opIHR5cGVzW2pdID0gcmVwbGFjZTtcbiAgICAgICAgICBpID0gZW5kIC0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXNy4gU2VhcmNoIGJhY2t3YXJkcyBmcm9tIGVhY2ggaW5zdGFuY2Ugb2YgYSBFdXJvcGVhbiBudW1iZXJcbiAgICAgIC8vIHVudGlsIHRoZSBmaXJzdCBzdHJvbmcgdHlwZSAoUiwgTCwgb3Igc29yKSBpcyBmb3VuZC4gSWYgYW4gTCBpc1xuICAgICAgLy8gZm91bmQsIHRoZW4gY2hhbmdlIHRoZSB0eXBlIG9mIHRoZSBFdXJvcGVhbiBudW1iZXIgdG8gTC5cbiAgICAgIGZvciAodmFyIGkgPSAwLCBjdXIgPSBvdXRlclR5cGU7IGkgPCBsZW47ICsraSkge1xuICAgICAgICB2YXIgdHlwZSA9IHR5cGVzW2ldO1xuICAgICAgICBpZiAoY3VyID09IFwiTFwiICYmIHR5cGUgPT0gXCIxXCIpIHR5cGVzW2ldID0gXCJMXCI7XG4gICAgICAgIGVsc2UgaWYgKGlzU3Ryb25nLnRlc3QodHlwZSkpIGN1ciA9IHR5cGU7XG4gICAgICB9XG5cbiAgICAgIC8vIE4xLiBBIHNlcXVlbmNlIG9mIG5ldXRyYWxzIHRha2VzIHRoZSBkaXJlY3Rpb24gb2YgdGhlXG4gICAgICAvLyBzdXJyb3VuZGluZyBzdHJvbmcgdGV4dCBpZiB0aGUgdGV4dCBvbiBib3RoIHNpZGVzIGhhcyB0aGUgc2FtZVxuICAgICAgLy8gZGlyZWN0aW9uLiBFdXJvcGVhbiBhbmQgQXJhYmljIG51bWJlcnMgYWN0IGFzIGlmIHRoZXkgd2VyZSBSIGluXG4gICAgICAvLyB0ZXJtcyBvZiB0aGVpciBpbmZsdWVuY2Ugb24gbmV1dHJhbHMuIFN0YXJ0LW9mLWxldmVsLXJ1biAoc29yKVxuICAgICAgLy8gYW5kIGVuZC1vZi1sZXZlbC1ydW4gKGVvcikgYXJlIHVzZWQgYXQgbGV2ZWwgcnVuIGJvdW5kYXJpZXMuXG4gICAgICAvLyBOMi4gQW55IHJlbWFpbmluZyBuZXV0cmFscyB0YWtlIHRoZSBlbWJlZGRpbmcgZGlyZWN0aW9uLlxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgICAgICBpZiAoaXNOZXV0cmFsLnRlc3QodHlwZXNbaV0pKSB7XG4gICAgICAgICAgZm9yICh2YXIgZW5kID0gaSArIDE7IGVuZCA8IGxlbiAmJiBpc05ldXRyYWwudGVzdCh0eXBlc1tlbmRdKTsgKytlbmQpIHt9XG4gICAgICAgICAgdmFyIGJlZm9yZSA9IChpID8gdHlwZXNbaS0xXSA6IG91dGVyVHlwZSkgPT0gXCJMXCI7XG4gICAgICAgICAgdmFyIGFmdGVyID0gKGVuZCA8IGxlbiA/IHR5cGVzW2VuZF0gOiBvdXRlclR5cGUpID09IFwiTFwiO1xuICAgICAgICAgIHZhciByZXBsYWNlID0gYmVmb3JlIHx8IGFmdGVyID8gXCJMXCIgOiBcIlJcIjtcbiAgICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGVuZDsgKytqKSB0eXBlc1tqXSA9IHJlcGxhY2U7XG4gICAgICAgICAgaSA9IGVuZCAtIDE7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSGVyZSB3ZSBkZXBhcnQgZnJvbSB0aGUgZG9jdW1lbnRlZCBhbGdvcml0aG0sIGluIG9yZGVyIHRvIGF2b2lkXG4gICAgICAvLyBidWlsZGluZyB1cCBhbiBhY3R1YWwgbGV2ZWxzIGFycmF5LiBTaW5jZSB0aGVyZSBhcmUgb25seSB0aHJlZVxuICAgICAgLy8gbGV2ZWxzICgwLCAxLCAyKSBpbiBhbiBpbXBsZW1lbnRhdGlvbiB0aGF0IGRvZXNuJ3QgdGFrZVxuICAgICAgLy8gZXhwbGljaXQgZW1iZWRkaW5nIGludG8gYWNjb3VudCwgd2UgY2FuIGJ1aWxkIHVwIHRoZSBvcmRlciBvblxuICAgICAgLy8gdGhlIGZseSwgd2l0aG91dCBmb2xsb3dpbmcgdGhlIGxldmVsLWJhc2VkIGFsZ29yaXRobS5cbiAgICAgIHZhciBvcmRlciA9IFtdLCBtO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47KSB7XG4gICAgICAgIGlmIChjb3VudHNBc0xlZnQudGVzdCh0eXBlc1tpXSkpIHtcbiAgICAgICAgICB2YXIgc3RhcnQgPSBpO1xuICAgICAgICAgIGZvciAoKytpOyBpIDwgbGVuICYmIGNvdW50c0FzTGVmdC50ZXN0KHR5cGVzW2ldKTsgKytpKSB7fVxuICAgICAgICAgIG9yZGVyLnB1c2gobmV3IEJpZGlTcGFuKDAsIHN0YXJ0LCBpKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIHBvcyA9IGksIGF0ID0gb3JkZXIubGVuZ3RoO1xuICAgICAgICAgIGZvciAoKytpOyBpIDwgbGVuICYmIHR5cGVzW2ldICE9IFwiTFwiOyArK2kpIHt9XG4gICAgICAgICAgZm9yICh2YXIgaiA9IHBvczsgaiA8IGk7KSB7XG4gICAgICAgICAgICBpZiAoY291bnRzQXNOdW0udGVzdCh0eXBlc1tqXSkpIHtcbiAgICAgICAgICAgICAgaWYgKHBvcyA8IGopIG9yZGVyLnNwbGljZShhdCwgMCwgbmV3IEJpZGlTcGFuKDEsIHBvcywgaikpO1xuICAgICAgICAgICAgICB2YXIgbnN0YXJ0ID0gajtcbiAgICAgICAgICAgICAgZm9yICgrK2o7IGogPCBpICYmIGNvdW50c0FzTnVtLnRlc3QodHlwZXNbal0pOyArK2opIHt9XG4gICAgICAgICAgICAgIG9yZGVyLnNwbGljZShhdCwgMCwgbmV3IEJpZGlTcGFuKDIsIG5zdGFydCwgaikpO1xuICAgICAgICAgICAgICBwb3MgPSBqO1xuICAgICAgICAgICAgfSBlbHNlICsrajtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHBvcyA8IGkpIG9yZGVyLnNwbGljZShhdCwgMCwgbmV3IEJpZGlTcGFuKDEsIHBvcywgaSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAob3JkZXJbMF0ubGV2ZWwgPT0gMSAmJiAobSA9IHN0ci5tYXRjaCgvXlxccysvKSkpIHtcbiAgICAgICAgb3JkZXJbMF0uZnJvbSA9IG1bMF0ubGVuZ3RoO1xuICAgICAgICBvcmRlci51bnNoaWZ0KG5ldyBCaWRpU3BhbigwLCAwLCBtWzBdLmxlbmd0aCkpO1xuICAgICAgfVxuICAgICAgaWYgKGxzdChvcmRlcikubGV2ZWwgPT0gMSAmJiAobSA9IHN0ci5tYXRjaCgvXFxzKyQvKSkpIHtcbiAgICAgICAgbHN0KG9yZGVyKS50byAtPSBtWzBdLmxlbmd0aDtcbiAgICAgICAgb3JkZXIucHVzaChuZXcgQmlkaVNwYW4oMCwgbGVuIC0gbVswXS5sZW5ndGgsIGxlbikpO1xuICAgICAgfVxuICAgICAgaWYgKG9yZGVyWzBdLmxldmVsID09IDIpXG4gICAgICAgIG9yZGVyLnVuc2hpZnQobmV3IEJpZGlTcGFuKDEsIG9yZGVyWzBdLnRvLCBvcmRlclswXS50bykpO1xuICAgICAgaWYgKG9yZGVyWzBdLmxldmVsICE9IGxzdChvcmRlcikubGV2ZWwpXG4gICAgICAgIG9yZGVyLnB1c2gobmV3IEJpZGlTcGFuKG9yZGVyWzBdLmxldmVsLCBsZW4sIGxlbikpO1xuXG4gICAgICByZXR1cm4gb3JkZXI7XG4gICAgfTtcbiAgfSkoKTtcblxuICAvLyBUSEUgRU5EXG5cbiAgQ29kZU1pcnJvci52ZXJzaW9uID0gXCI1LjkuMFwiO1xuXG4gIHJldHVybiBDb2RlTWlycm9yO1xufSk7XG4iLCJ2YXIgQ00gPSByZXF1aXJlKCdjb2RlbWlycm9yJyk7XG52YXIgUmVhY3QgPSByZXF1aXJlKCdyZWFjdCcpO1xudmFyIGNsYXNzTmFtZSA9IHJlcXVpcmUoJ2NsYXNzbmFtZXMnKTtcblxudmFyIENvZGVNaXJyb3IgPSBSZWFjdC5jcmVhdGVDbGFzcyh7XG5cblx0cHJvcFR5cGVzOiB7XG5cdFx0b25DaGFuZ2U6IFJlYWN0LlByb3BUeXBlcy5mdW5jLFxuXHRcdG9uRm9jdXNDaGFuZ2U6IFJlYWN0LlByb3BUeXBlcy5mdW5jLFxuXHRcdG9wdGlvbnM6IFJlYWN0LlByb3BUeXBlcy5vYmplY3QsXG5cdFx0cGF0aDogUmVhY3QuUHJvcFR5cGVzLnN0cmluZyxcblx0XHR2YWx1ZTogUmVhY3QuUHJvcFR5cGVzLnN0cmluZyxcblx0XHRjbGFzc05hbWU6IFJlYWN0LlByb3BUeXBlcy5hbnksXG5cdH0sXG5cblx0Z2V0SW5pdGlhbFN0YXRlICgpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNGb2N1c2VkOiBmYWxzZVxuXHRcdH07XG5cdH0sXG5cblx0Y29tcG9uZW50RGlkTW91bnQgKCkge1xuXHRcdHZhciB0ZXh0YXJlYU5vZGUgPSB0aGlzLnJlZnMudGV4dGFyZWE7XG5cdFx0dGhpcy5jb2RlTWlycm9yID0gQ00uZnJvbVRleHRBcmVhKHRleHRhcmVhTm9kZSwgdGhpcy5wcm9wcy5vcHRpb25zKTtcblx0XHR0aGlzLmNvZGVNaXJyb3Iub24oJ2NoYW5nZScsIHRoaXMuY29kZW1pcnJvclZhbHVlQ2hhbmdlZCk7XG5cdFx0dGhpcy5jb2RlTWlycm9yLm9uKCdmb2N1cycsIHRoaXMuZm9jdXNDaGFuZ2VkLmJpbmQodGhpcywgdHJ1ZSkpO1xuXHRcdHRoaXMuY29kZU1pcnJvci5vbignYmx1cicsIHRoaXMuZm9jdXNDaGFuZ2VkLmJpbmQodGhpcywgZmFsc2UpKTtcblx0XHR0aGlzLl9jdXJyZW50Q29kZW1pcnJvclZhbHVlID0gdGhpcy5wcm9wcy5kZWZhdWx0VmFsdWUgfHwgdGhpcy5wcm9wcy52YWx1ZSB8fCAnJztcblx0XHR0aGlzLmNvZGVNaXJyb3Iuc2V0VmFsdWUodGhpcy5fY3VycmVudENvZGVtaXJyb3JWYWx1ZSk7XG5cdH0sXG5cblx0Y29tcG9uZW50V2lsbFVubW91bnQgKCkge1xuXHRcdC8vIHRvZG86IGlzIHRoZXJlIGEgbGlnaHRlci13ZWlnaHQgd2F5IHRvIHJlbW92ZSB0aGUgY20gaW5zdGFuY2U/XG5cdFx0aWYgKHRoaXMuY29kZU1pcnJvcikge1xuXHRcdFx0dGhpcy5jb2RlTWlycm9yLnRvVGV4dEFyZWEoKTtcblx0XHR9XG5cdH0sXG5cblx0Y29tcG9uZW50V2lsbFJlY2VpdmVQcm9wcyAobmV4dFByb3BzKSB7XG5cdFx0aWYgKHRoaXMuY29kZU1pcnJvciAmJiBuZXh0UHJvcHMudmFsdWUgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9jdXJyZW50Q29kZW1pcnJvclZhbHVlICE9PSBuZXh0UHJvcHMudmFsdWUpIHtcblx0XHRcdHRoaXMuY29kZU1pcnJvci5zZXRWYWx1ZShuZXh0UHJvcHMudmFsdWUpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5leHRQcm9wcy5vcHRpb25zID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Zm9yICh2YXIgb3B0aW9uTmFtZSBpbiBuZXh0UHJvcHMub3B0aW9ucykge1xuXHRcdFx0XHRpZiAobmV4dFByb3BzLm9wdGlvbnMuaGFzT3duUHJvcGVydHkob3B0aW9uTmFtZSkpIHtcblx0XHRcdFx0XHR0aGlzLmNvZGVNaXJyb3Iuc2V0T3B0aW9uKG9wdGlvbk5hbWUsIG5leHRQcm9wcy5vcHRpb25zW29wdGlvbk5hbWVdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHRnZXRDb2RlTWlycm9yICgpIHtcblx0XHRyZXR1cm4gdGhpcy5jb2RlTWlycm9yO1xuXHR9LFxuXG5cdGZvY3VzICgpIHtcblx0XHRpZiAodGhpcy5jb2RlTWlycm9yKSB7XG5cdFx0XHR0aGlzLmNvZGVNaXJyb3IuZm9jdXMoKTtcblx0XHR9XG5cdH0sXG5cblx0Zm9jdXNDaGFuZ2VkIChmb2N1c2VkKSB7XG5cdFx0dGhpcy5zZXRTdGF0ZSh7XG5cdFx0XHRpc0ZvY3VzZWQ6IGZvY3VzZWRcblx0XHR9KTtcblx0XHR0aGlzLnByb3BzLm9uRm9jdXNDaGFuZ2UgJiYgdGhpcy5wcm9wcy5vbkZvY3VzQ2hhbmdlKGZvY3VzZWQpO1xuXHR9LFxuXG5cdGNvZGVtaXJyb3JWYWx1ZUNoYW5nZWQgKGRvYywgY2hhbmdlKSB7XG5cdFx0dmFyIG5ld1ZhbHVlID0gZG9jLmdldFZhbHVlKCk7XG5cdFx0dGhpcy5fY3VycmVudENvZGVtaXJyb3JWYWx1ZSA9IG5ld1ZhbHVlO1xuXHRcdHRoaXMucHJvcHMub25DaGFuZ2UgJiYgdGhpcy5wcm9wcy5vbkNoYW5nZShuZXdWYWx1ZSk7XG5cdH0sXG5cblx0cmVuZGVyICgpIHtcblx0XHR2YXIgZWRpdG9yQ2xhc3NOYW1lID0gY2xhc3NOYW1lKFxuXHRcdFx0J1JlYWN0Q29kZU1pcnJvcicsXG5cdFx0XHR0aGlzLnN0YXRlLmlzRm9jdXNlZCA/ICdSZWFjdENvZGVNaXJyb3ItLWZvY3VzZWQnIDogbnVsbCxcblx0XHRcdHRoaXMucHJvcHMuY2xhc3NOYW1lXG5cdFx0KTtcblxuXHRcdHJldHVybiAoXG5cdFx0XHQ8ZGl2IGNsYXNzTmFtZT17ZWRpdG9yQ2xhc3NOYW1lfT5cblx0XHRcdFx0PHRleHRhcmVhIHJlZj1cInRleHRhcmVhXCIgbmFtZT17dGhpcy5wcm9wcy5wYXRofSBkZWZhdWx0VmFsdWU9eycnfSBhdXRvQ29tcGxldGU9XCJvZmZcIiAvPlxuXHRcdFx0PC9kaXY+XG5cdFx0KTtcblx0fVxuXG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBDb2RlTWlycm9yO1xuIl19