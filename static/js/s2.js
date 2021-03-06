var sjs = sjs || {};


var ReaderApp = React.createClass({displayName: "ReaderApp",
  propTypes: {
    multiPanel:                  React.PropTypes.bool,
    initialRefs:                 React.PropTypes.array,
    initialFilter:               React.PropTypes.array,
    initialMenu:                 React.PropTypes.string,
    initialQuery:                React.PropTypes.string,
    initialSheetsTag:            React.PropTypes.string,
    initialNavigationCategories: React.PropTypes.array,
    initialSettings:             React.PropTypes.object,
    initialPanels:               React.PropTypes.array
  },
  getInitialState: function() {
    var panels = [];
    if (!this.props.multiPanel) {
      var mode = this.props.initialFilter ? "TextAndConnections" : "Text";
      panels[0] = ({refs: this.props.initialRefs, mode: mode, filter: this.props.initialFilter});
      if (mode === "TextAndConnections") {
        panels[0].highlightedRefs = this.props.initialRefs;
      }
    } else {
      panels.push({refs: this.props.initialRefs, mode: "Text"});
      if (this.props.initialFilter){
        panels.push({refs: this.props.initialRefs, filter: this.props.initialFilter, mode: "Connections"});
      }
      for (var i = panels.length; i < this.props.initialPanels.length; i++) {
        panels.push(this.props.initialPanels[i]);
      }
    }
    return {
      panels: panels
    };
  },
  componentDidMount: function() {
    this.updateHistoryState(true); // make sure initial page state is in history, (passing true to replace)
    window.addEventListener("popstate", this.handlePopState);
  },
  componentWillUnmount: function() {
    window.removeEventListener("popstate", this.handlePopState);
  },
  handlePopState: function(event) {
    var state = event.state;
    if (state) {
      var kind = "";
      sjs.track.event("Reader", "Pop State", kind);
      this.justPopped = true;
      this.setState(state);
      //console.log("Pop");
      //console.log(state);
    }
  },
  shouldHistoryUpdate: function() {
    // Compare the current state to the state last pushed to history,
    // Return true if the change warrants pushing to history.
    if (!history.state) { return true; }

    if (history.state.panels.length !== this.state.panels.length) { return true; }

    for (var i = 0; i < this.state.panels.length; i++) {
      // Cycle through each panel, compare previous state to next state, looking for differences
      var prev  = history.state.panels[i];
      var next  = this.state.panels[i];

      if ((prev.mode !== next.mode) ||
          (prev.menuOpen !== next.menuOpen) ||
          (next.mode === "Text" && prev.refs.slice(-1)[0] !== next.refs.slice(-1)[0]) || 
          (next.mode === "TextAndConnections" && prev.highlightedRefs.slice(-1)[0] !== next.highlightedRefs.slice(-1)[0]) || 
          (next.mode === "Connections" && prev.filter && !prev.filter.compare(next.filter)) ||
          (next.mode === "Connections" && !prev.refs.compare(next.refs)) ||
          (prev.searchQuery !== next.searchQuery) ||
          (prev.navigationSheetTag !== next.navigationSheetTag)) {
         return true;
      } else if (prev.navigationCategories !== next.navigationCategories) {
        // Handle array comparison, !== could mean one is null or both are arrays
        if (!prev.navigationCategories || !next.navigationCategories) {
          return true; // They are not equal and one is null
        } else if (!prev.navigationCategories.compare(next.navigationCategories)) {
          return true; // both are set, compare arrays
        }
      }
    }
    return false;  
  },
  makeHistoryState: function() {
    // Returns an object with state, title and url params for the current state
    var histories = []; 
    for (var i = 0; i < this.state.panels.length; i++) {
      // Walk through each panel, create a history object as though for this panel alone
      var hist    = {url: ""};
      var state   = clone(this.state.panels[i]);
      if (state && state.menuOpen) {
        switch (state.menuOpen) {
          case "home":
            hist.title = "Sefaria: a Living Library of Jewish Texts Online";
            hist.url   = "";
            hist.mode  = "home";
            break;
          case "navigation":
            var cats   = state.navigationCategories ? state.navigationCategories.join("/") : "";
            hist.title = cats ? state.navigationCategories.join(", ") + " | Sefaria" : "Texts | Sefaria";
            hist.url   = "texts" + (cats ? "/" + cats : "");
            hist.mode  = "navigation";
            break;
          case "text toc":
            var ref    = state.refs.slice(-1)[0];
            var title  = ref ? parseRef(ref).book : "404";
            hist.title = title + " | Sefaria";
            hist.url   = title.replace(/ /g, "_");
            hist.mode  = "text toc";
            break;
          case "search":
            hist.title = state.searchQuery ? state.searchQuery + " | " : "";
            hist.title += "Sefaria Search";
            hist.url   = "search" + (state.searchQuery ? "?q=" + state.searchQuery : "");
            hist.mode  = "search";
            break;
          case "sheets":
            if (state.navigationSheetTag) { 
              hist.url   = "sheets/tags/" + state.navigationSheetTag; 
              hist.title = state.navigationSheetTag + " | Sefaria Source Sheets";
              hist.mode  = "sheets tag";
            } else {
              hist.url   = "sheets";
              hist.title = "Sefaria Source Sheets";
              hist.mode  = "sheets";
            }
            break;
        }
      } else if (state.mode === "Text") {
        hist.title  = state.refs.slice(-1)[0];
        hist.url    = normRef(hist.title);
        hist.mode   = "Text"
      } else if (state.mode === "Connections") {
        var ref     = state.refs.slice(-1)[0];
        var sources = state.filter.length ? state.filter.join("+") : "all";
        hist.title  = ref  + " with " + (sources === "all" ? "Connections" : sources);;
        hist.url    = normRef(ref) + "?with=" + sources;
        hist.mode   = "Connections"
      } else if (state.mode === "TextAndConnections") {
        var ref     = state.highlightedRefs.slice(-1)[0];
        var sources = state.filter.length ? state.filter[0] : "all";
        hist.title  = ref  + " with " + (sources === "all" ? "Connections" : sources);;
        hist.url    = normRef(ref) + "?with=" + sources;
        hist.mode   = "TextAndConnections"
      } else {
        continue;
      }
      histories.push(hist);     
    }

    // Now merge all history object into one
    var url   = "/" + (histories.length ? histories[0].url : "");
    var title =  histories.length ? histories[0].title : "Sefaria"
    var hist  = {state: this.state, url: url, title: title};
    for (var i = 1; i < histories.length; i++) {
      if (histories[i-1].mode === "Text" && histories[i].mode === "Connections") {
        if (i == 1) {
          // short form for two panels text+commentary - e.g., /Genesis.1?with=Rashi
          hist.url   = "/" + histories[i].url;
          hist.title = histories[i].title;
        } else {
          var replacer = "&p" + i + "="
          hist.url    = hist.url.replace(RegExp(replacer + ".*"), "");
          hist.url   += replacer + histories[i].url.replace("with=", "with" + i + "=").replace("?", "&");
          hist.title += " & " + histories[i].title; // TODO this doesn't trim title properly
        }
      } else {
        var next    = "&p=" + histories[i].url;
        next        = next.replace("?", "&").replace(/=/g, (i+1) + "=");
        hist.url   += next;
        hist.title += " & " + histories[i].title;
      }
    }
    hist.url = hist.url.replace(/&/, "?");

    // for testing
    if (window.location.pathname.indexOf("/s2") === 0) { hist.url = "/s2" + hist.url; }

    return hist;
  },
  updateHistoryState: function(replace) {
    if (!this.shouldHistoryUpdate()) { 
      return; 
    }

    var hist = this.makeHistoryState();
    if (replace) {
      history.replaceState(hist.state, hist.title, hist.url);
      //console.log("Replace History")
      //console.log(hist);
    } else {
      history.pushState(hist.state, hist.title, hist.url);
      //console.log("Push History");
      //console.log(hist);
    }
    $("title").html(hist.title);

    sjs.track.pageview(hist.url);
  },
  handlePanelUpdate: function(n, action, state) {
    // When panel `n` wants to change history with `action` (either "push" or "replace"), update with `state`
    // Dirty check with JSON to see if this object has changed or not
    var current = JSON.stringify(this.state.panels[n]);
    var update  = JSON.stringify(state);
    if (current !== update) { // Ignore unless state changed
      //console.log("Panel update called with " + action + " from " + n);
      //console.log(state);
      var langChange  = this.state.panels[n].completeState && state.settings.language !== this.state.panels[n].settings.language;

      this.state.panels[n] = clone(state);
      if (this.state.panels.length > n+1) {
        var next = this.state.panels[n+1];
        if (langChange && next.mode === "Connections") {
          // When the driving panel changes langauge, carry that to the dependent panel
          next.settings.language = state.settings.language;
        }
      }
      this.setState({panels: this.state.panels});

      // Don't push history if the panel in the current state was ReaderApp (only push if the state was generated by ReaderPanel)
      // Allows the panels to load initially without each panel triggering a history push
      var replace = action === "replace" || !this.state.panels[n].completeState;
      this.updateHistoryState(replace);
    } else { 
      //console.log("skipping")
    }

  },
  handleSegmentClick: function(n, ref) {
    // Handle a click on a text segment `ref` in from panel in position `n`
    // Update or add panel after this one to be a TextList
    this.openTextListAt(n+1, [ref]);
    this.setTextListHighlight(n, [ref])
  },
  openPanelAt: function(n, ref) {
    // Open a new panel after `n` with the new ref
    this.state.panels.splice(n+1, 0, {refs: [ref], mode: "Text"});
    this.setState({panels: this.state.panels});
  },
  setTextListHighlight: function(n, refs) {
    // Set the textListHighlight for panel `n` to `ref`
    // If no TextList panel is currently open, do nothing
    refs = typeof refs === "string" ? [refs] : refs;
    var next = this.state.panels[n+1];

    if (next && next.mode === "Connections" && !next.menuOpen) {
      this.openTextListAt(n+1, refs);
    }
    return;
  },
  openTextListAt: function(n, refs) {
    // Make the panel open at position `n` into a TextList for `ref`
    // `refs` is an array of ref strings
    if (n === this.state.panels.length) {
      this.state.panels.push({refs: [], mode: "Connections"});
    }
    var panel = this.state.panels[n];
    var oref1 = parseRef(panel.refs.slice(-1)[0]);
    var oref2 = parseRef(refs.slice(-1)[0]);
    // If this is a new text reset the filter, otherwise keep the current filter
    panel.filter   = oref1.book === oref2.book ? panel.filter : [];
    panel.refs     = refs;
    panel.menuOpen = null;
    panel.mode     = "Connections";
    this.setState({panels: this.state.panels});
  },
  closePanel: function(n) {
    if (this.state.panels[n].mode === "Connections" && this.state.panels.length > 1) {
      this.state.panels[n-1].highlightedRefs = [];
    }
    this.state.panels.splice(n, 1);
    this.setState({panels: this.state.panels});
    this.updateHistoryState();
  },
  render: function() {
    var width = 100.0/this.state.panels.length;
    var panels = [];
    for (var i = 0; i < this.state.panels.length; i++) {
      var panel                    = clone(this.state.panels[i]);
      var style                    = {width: width + "%", left: (width * i) + "%"};
      var multi                    = this.props.multiPanel;
      var onSegmentClick           = multi ? this.handleSegmentClick.bind(null, i) : null;
      var onCitationClick          = this.openPanelAt.bind(null, i);
      var onTextListClick          = this.openPanelAt.bind(null, i);
      var onPanelUpdate            = this.handlePanelUpdate.bind(null, i);
      var setTextListHightlight    = this.setTextListHighlight.bind(null, i);
      var closePanel               = this.closePanel.bind(null, i);

      if (this.state.panels.length > i+1) {
        var followingPanel    = this.state.panels[i+1];
        panel.highlightedRefs = followingPanel.mode == "Connections" ? this.state.panels[i+1].refs : [];
      } else {
        panel.highlightedRefs = panel.highlightedRefs || [];
      }
      
      var ref   = panel.refs && panel.refs.length ? panel.refs[0] : null;
      var oref  = ref ? parseRef(ref) : null;
      var title = oref && oref.book ? oref.book : 0;
      // Keys must be constant as text scrolls, but changing as new panels open in new positions
      // Use a combination of the panel number and text title
      var key   = i + title;
      if (panel.completeState) {
        panels.push(React.createElement("div", {className: "readerPanelBox", style: style, key: key}, 
                      React.createElement(ReaderPanel, {
                        initialState: panel, 
                        multiPanel: multi, 
                        onSegmentClick: onSegmentClick, 
                        onCitationClick: onCitationClick, 
                        historyUpdate: onPanelUpdate, 
                        onCitationClick: onCitationClick, 
                        onTextListClick: onTextListClick, 
                        setTextListHightlight: setTextListHightlight, 
                        closePanel: closePanel, 
                        panelsOpen: this.state.panels.length})
                  ));
      } else {
        panels.push(React.createElement("div", {className: "readerPanelBox", style: style, key: key}, 
                      React.createElement(ReaderPanel, {
                        initialRefs: panel.refs, 
                        initialMode: panel.mode, 
                        initialFilter: panel.filter, 
                        initialHighlightedRefs: panel.highlightedRefs, 
                        initialMenu: i == 0 ? this.props.initialMenu : null, 
                        initialQuery: this.props.initialQuery, 
                        initialSheetsTag: this.props.initialSheetsTag, 
                        initialNavigationCategories: this.props.initialNavigationCategories, 
                        initialSettings: clone(this.props.initialSettings), 
                        multiPanel: multi, 
                        onSegmentClick: onSegmentClick, 
                        onCitationClick: onCitationClick, 
                        onTextListClick: onTextListClick, 
                        historyUpdate: onPanelUpdate, 
                        closePanel: closePanel, 
                        panelsOpen: this.state.panels.length})
                    ));
      }
    }
    var classes = classNames({readerApp: 1, multiPanel: this.props.multiPanel});
    return (React.createElement("div", {className: classes}, panels));
  }
});


var ReaderPanel = React.createClass({displayName: "ReaderPanel",
  propTypes: {
    initialRefs:            React.PropTypes.array,
    initialMode:            React.PropTypes.string,
    initialFilter:          React.PropTypes.array,
    initialHighlightedRefs: React.PropTypes.array,
    initialMenu:            React.PropTypes.string,
    initialQuery:           React.PropTypes.string,
    initialSheetsTag:       React.PropTypes.string,
    initialSettings:        React.PropTypes.object,
    initialState:           React.PropTypes.object, // if present, Trumps all props above
    onSegmentClick:         React.PropTypes.func,
    onCitationClick:        React.PropTypes.func,
    onTextListClick:        React.PropTypes.func,
    historyUpdate:          React.PropTypes.func,
    closePanel:             React.PropTypes.func,
    highlightedRefs:        React.PropTypes.array,
    mulitPanel:             React.PropTypes.bool,
    panelsOpen:             React.PropTypes.number
  },
  getInitialState: function() {
    if (this.props.initialState) {
      return this.props.initialState;
    }

    return {
      refs: this.props.initialRefs, // array of ref strings
      mode: this.props.initialMode, // "Text", "TextAndConnections", "Connections"
      filter: this.props.initialFilter || [],
      highlightedRefs: this.props.initialHighlightedRefs || [],
      recentFilters: [],
      settings: this.props.initialSettings || {
        language:      "english",
        layoutDefault: "segmented",
        layoutTalmud:  "continuous",
        layoutTanach:  "segmented",
        color:         "light",
        fontSize:      62.5
      },
      menuOpen:             this.props.initialMenu || null, // "navigation", "text toc", "display", "search", "sheets", "home"
      navigationCategories: this.props.initialNavigationCategories || [],
      navigationSheetTag:   this.props.initialSheetsTag || null,
      searchQuery:          this.props.initialQuery || null,
      navigationSheetTag:   this.props.initialSheetsTag || null,
      displaySettingsOpen:  false,
      completeState:        true
    }
  },
  componentDidMount: function() {
    if (this.props.historyUpdate) {
      // Make sure the initial state of this panel is pushed up to ReaderApp
      this.props.historyUpdate("replace", this.state);     
    }
    this.setHeadroom();
    this.trackPanelOpens();
  },
  componentWillReceiveProps: function(nextProps) {
    if (nextProps.initialFilter) {
      this.openConnectionsInPanel(nextProps.initialRefs);
    }
    if (nextProps.initialState) {
      this.setState(nextProps.initialState);
    }
  },
  componentWillUpdate: function(nextProps, nextState) {

  },
  componentDidUpdate: function(prevProps, prevState) {
    if (this.props.historyUpdate) {
      if (this.replaceHistory) {
        this.props.historyUpdate("replace", this.state);
      } else {
        this.props.historyUpdate("push", this.state);
      }      
    }
    this.setHeadroom();
    if (prevState.refs.compare(this.state.refs)) {
      this.trackPanelOpens();
    }
  },
  handleBaseSegmentClick: function(ref) {
    if (this.state.mode === "TextAndConnections") {
      this.closeConnectionsInPanel();
    } else if (this.state.mode === "Text") {
      if (this.props.multiPanel) {
        this.setTextListHightlight(ref);
        this.props.onSegmentClick(ref);
      } else {
        this.openConnectionsInPanel(ref);
      }
    }
  },
  handleCitationClick: function(ref) {
    if (this.props.multiPanel) {
      this.props.onCitationClick(ref);
    } else {
      this.showBaseText(ref);
    }
  },
  handleTextListClick: function(ref) {
    if (this.props.multiPanel) {
      this.props.onTextListClick(ref);
    } else {
      this.showBaseText(ref);
    }
  },
  setHeadroom: function() {
    if (this.props.multiPanel) { return; }
    var $node    = $(ReactDOM.findDOMNode(this));
    var $header  = $node.find(".readerControls");
    if (this.state.mode !== "TextAndConnections") {
      var scroller = $node.find(".textColumn")[0];
      $header.headroom({scroller: scroller});
    }
  },
  openConnectionsInPanel: function(ref) {
    var refs = typeof ref == "string" ? [ref] : ref;
    this.replaceHistory = this.state.mode === "TextAndConnections"; // Don't push history for change in Connections focus
    this.setState({highlightedRefs: refs, mode: "TextAndConnections" });      
  },
  closeConnectionsInPanel: function() {
    // Return to the original text in the ReaderPanel contents
    this.setState({highlightedRefs: [], mode: "Text"});
  },  
  showBaseText: function(ref, replaceHistory) {
    // Set the current primary text
    // `replaceHistory` - bool whether to replace browser history rather than push for this change
    if (!ref) { return; }
    this.replaceHistory = typeof replaceHistory === "undefined" ? false : replaceHistory;
    this.setState({
      mode: "Text",
      refs: [ref],
      filter: [],
      recentFilters: [],
      menuOpen: null
    });
  },
  updateTextColumn: function(refs) {
    // Change the refs in the current TextColumn, for infinite scroll up/down.
    this.replaceHistory = true;
    this.setState({ refs: refs });
  },
  setTextListHightlight: function(refs) {
    refs = typeof refs === "string" ? [refs] : refs;
    this.replaceHistory = true; 
    this.setState({highlightedRefs: refs});
    if (this.props.multiPanel) {
      this.props.setTextListHightlight(refs);
    }
  },
  closeMenus: function() {
    var state = {
      // If there's no content to show, return to home
      menuOpen: this.state.refs.slice(-1)[0] ? null: "home",
      searchQuery: null,
      navigationCategories: null,
      navigationSheetTag: null
    }
    this.setState(state);
  },
  openMenu: function(menu) {
    this.setState({
      menuOpen: menu,
      searchQuery: null,
      navigationCategories: null,
      navigationSheetTag: null
    });
  },
  setNavigationCategories: function(categories) {
    this.setState({menuOpen: "navigation", navigationCategories: categories});
  },
  setSheetTag: function (tag) {
    this.setState({navigationSheetTag: tag});
  },
  setSearchQuery: function (query) {
    this.setState({searchQuery: query});
  },
  setFilter: function(filter, updateRecent) {
    // Sets the current filter for Connected Texts (TextList)
    // If updateRecent is true, include the curent setting in the list of recent filters.
    if (updateRecent && filter) {
      if ($.inArray(filter, this.state.recentFilters) !== -1) {
        this.state.recentFilters.toggle(filter);
      }
      this.state.recentFilters = [filter].concat(this.state.recentFilters);
    }
    filter = filter ? [filter] : [];
    this.setState({recentFilters: this.state.recentFilters, filter: filter});
  },
  openSearch: function(query) {
    this.setState({
      menuOpen: "search",
      searchQuery: query
    });
  },
  openDisplaySettings: function() {
    this.setState({displaySettingsOpen: true});
  },
  closeDisplaySettings: function() {
    this.setState({displaySettingsOpen: false});
  },
  setOption: function(option, value) {
    if (option === "fontSize") {
      var step = 1.15;
      var size = this.state.settings.fontSize;
      value = (value === "smaller" ? size/step : size*step);
    } else if (option === "layout") {
      var category = this.currentCategory();
      var option = category === "Tanach" || category === "Talmud" ? "layout" + category : "layoutDefault";
    }

    this.state.settings[option] = value;
    var state = {settings: this.state.settings};
    if (option !== "fontSize") { state.displaySettingsOpen = false; }
    this.setState(state);
    $.cookie(option, value, {path: "/"});
    if (option === "language") {
      $.cookie("contentLang", value, {path: "/"});
    }
  },
  trackPanelOpens: function() {
    if (this.state.mode === "Connections") { return; }
    this.tracked = this.tracked || [];
    // Do a little dance to avoid tracking something we've already just tracked
    // e.g. when refs goes from ["Genesis 5"] to ["Genesis 4", "Genesis 5"] don't track 5 again
    for (var i = 0; i < this.state.refs.length; i++) {
      if ($.inArray(this.state.refs[i], this.tracked) == -1) {
        sjs.track.open(this.state.refs[i]);
        this.tracked.push(this.state.refs[i]);
      }
    }
  },
  currentMode: function() {
    return this.state.mode;
  },
  currentRef: function() {
    // Returns a string of the current ref, the first if there are many
    return this.state.refs && this.state.refs.length ? this.state.refs[0] : null;
  },
  lastCurrentRef: function() {
    // Returns a string of the current ref, the last if there are many
    var ret = this.state.refs && this.state.refs.length ? this.state.refs.slice(-1)[0] : null;
    if (ret && typeof ret == "object") {debugger;}
    return ret;
  },
  currentData: function() {
    // Returns the data from the library of the current ref
    var ref  = this.currentRef();
    if (!ref) { return null; }
    var data = sjs.library.ref(ref);
    return data; 
  },
  currentBook: function() {
    var data = this.currentData();
    if (data) {
      return data.indexTitle;
    } else {
      var pRef = parseRef(this.currentRef());
      return "book" in pRef ? pRef.book : null;
    }
  },
  currentCategory: function() {
    var book = this.currentBook();
    return (sjs.library.index(book) ? sjs.library.index(book).categories[0] : null);
  },
  currentLayout: function() {
    var category = this.currentCategory();
    if (!category) { return null; }
    var option = category === "Tanach" || category === "Talmud" ? "layout" + category : "layoutDefault";
    return this.state.settings[option];  
  },
  render: function() {
    var items = [];
    if (this.state.mode === "Text" || this.state.mode === "TextAndConnections") {
      items.push(React.createElement(TextColumn, {
          srefs: this.state.refs, 
          highlightedRefs: this.state.highlightedRefs, 
          basetext: true, 
          withContext: true, 
          loadLinks: true, 
          prefetchNextPrev: true, 
          multiPanel: this.props.multiPanel, 
          mode: this.state.mode, 
          settings: clone(this.state.settings), 
          setOption: this.setOption, 
          showBaseText: this.showBaseText, 
          updateTextColumn: this.updateTextColumn, 
          onSegmentClick: this.handleBaseSegmentClick, 
          onCitationClick: this.handleCitationClick, 
          setTextListHightlight: this.setTextListHightlight, 
          panelsOpen: this.props.panelsOpen, 
          filter: this.state.filter, 
          key: "text"}));
    }
    if (this.state.mode === "Connections" || this.state.mode === "TextAndConnections") {
      items.push(React.createElement(TextList, {
          srefs: this.state.mode === "Connections" ? this.state.refs : this.state.highlightedRefs, 
          filter: this.state.filter || [], 
          recentFilters: this.state.recentFilters, 
          fullPanel: this.props.multiPanel, 
          multiPanel: this.props.multiPanel, 
          setFilter: this.setFilter, 
          cloneConectionsInPanel: this.closeConnectionsInPanel, 
          openNav: this.openMenu.bind(null, "navigation"), 
          openDisplaySettings: this.openDisplaySettings, 
          onTextClick: this.handleTextListClick, 
          onCitationClick: this.handleCitationClick, 
          closePanel: this.props.panelsOpen > 1 ? this.props.closePanel : null, 
          key: "connections"})
      );
    }

    if (this.state.menuOpen === "home") {
      var menu = (React.createElement(ReaderNavigationMenu, {
                    home: true, 
                    categories: [], 
                    setCategories: this.setNavigationCategories || [], 
                    closeNav: this.closeMenus, 
                    openNav: this.openMenu.bind(null, "navigation"), 
                    openSearch: this.openSearch, 
                    openMenu: this.openMenu, 
                    openDisplaySettings: this.openDisplaySettings, 
                    showBaseText: this.showBaseText}));

    } else if (this.state.menuOpen === "navigation") {
      var menu = (React.createElement(ReaderNavigationMenu, {
                    categories: this.state.navigationCategories || [], 
                    setCategories: this.setNavigationCategories, 
                    closeNav: this.closeMenus, 
                    openNav: this.openMenu.bind(null, "navigation"), 
                    openSearch: this.openSearch, 
                    openMenu: this.openMenu, 
                    openDisplaySettings: this.openDisplaySettings, 
                    showBaseText: this.showBaseText}));

    } else if (this.state.menuOpen === "text toc") {
      var menu = (React.createElement(ReaderTextTableOfContents, {
                    close: this.closeMenus, 
                    text: this.currentBook(), 
                    category: this.currentCategory(), 
                    currentRef: this.currentRef(), 
                    openNav: this.openMenu.bind(null, "navigation"), 
                    openDisplaySettings: this.openDisplaySettings, 
                    showBaseText: this.showBaseText}));

    } else if (this.state.menuOpen === "search") {
      var settings = {query: this.state.searchQuery, page: 1};
      var menu = (React.createElement(SearchPage, {
                    initialSettings: settings, 
                    settings: clone(this.state.settings), 
                    onResultClick: this.showBaseText, 
                    onQueryChange: this.setSearchQuery, 
                    openDisplaySettings: this.openDisplaySettings, 
                    close: this.closeMenus}));

    } else if (this.state.menuOpen === "sheets") {
      var menu = (React.createElement(SheetsNav, {
                    openNav: this.openMenu.bind(null, "navigation"), 
                    close: this.closeMenus, 
                    initialTag: this.state.navigationSheetTag, 
                    setSheetTag: this.setSheetTag}));
    } else {
      var menu = null;
    }

    var classes  = {readerPanel: 1};
    classes[this.currentLayout()]         = 1;
    classes[this.state.settings.language] = 1;
    classes[this.state.settings.color]    = 1;
    classes = classNames(classes);
    var style = {"fontSize": this.state.settings.fontSize + "%"};
    var hideReaderControls = (this.props.multiPanel && this.state.mode === "Connections" && ![].compare(this.state.filter)) ||
                             this.state.mode === "TextAndConnections";
    return (
      React.createElement("div", {className: classes}, 
        hideReaderControls ? null :  
        (React.createElement(ReaderControls, {
          showBaseText: this.showBaseText, 
          currentRef: this.lastCurrentRef(), 
          currentMode: this.currentMode, 
          currentCategory: this.currentCategory, 
          currentBook: this.currentBook, 
          multiPanel: this.props.multiPanel, 
          settings: this.state.settings, 
          setOption: this.setOption, 
          openMenu: this.openMenu, 
          closeMenus: this.closeMenus, 
          openDisplaySettings: this.openDisplaySettings, 
          currentLayout: this.currentLayout, 
          closePanel: this.props.panelsOpen > 1 ? this.props.closePanel : null})), 

        React.createElement("div", {className: "readerContent", style: style}, 
          items
        ), 

        menu, 
        this.state.displaySettingsOpen ? (React.createElement(ReaderDisplayOptionsMenu, {
                                              settings: this.state.settings, 
                                              setOption: this.setOption, 
                                              currentLayout: this.currentLayout, 
                                              menuOpen: this.state.menuOpen})) : null, 
        this.state.displaySettingsOpen ? (React.createElement("div", {className: "mask", onClick: this.closeDisplaySettings})) : null

      )
    );
  }
});


var ReaderControls = React.createClass({displayName: "ReaderControls",
  // The Header of a Reader panel which contains controls for 
  // display, navigation etc.
  propTypes: {
    settings:                React.PropTypes.object.isRequired,
    showBaseText:            React.PropTypes.func.isRequired,
    setOption:               React.PropTypes.func.isRequired,
    openMenu:                React.PropTypes.func.isRequired,
    openDisplaySettings:     React.PropTypes.func.isRequired,
    closeMenus:              React.PropTypes.func.isRequired,
    currentRef:              React.PropTypes.string,
    currentMode:             React.PropTypes.func.isRequired,
    currentCategory:         React.PropTypes.func.isRequired,
    currentBook:             React.PropTypes.func.isRequired,
    currentLayout:           React.PropTypes.func.isRequired,
    closePanel:              React.PropTypes.func,
    multiPanel:              React.PropTypes.bool
  },
  render: function() {
    var title     = this.props.currentRef;
    if (title) {
      var oref    = sjs.library.ref(title);
      var heTitle = oref ? oref.heTitle : "";      
    } else {
      var heTitle = "";
    }

    var mode = this.props.currentMode();
    var hideHeader  = !this.props.multiPanel && mode === "Connections";

    if (title && !oref) {
      // If we don't have this data yet, rerender when we do so we can set the Hebrew title
      sjs.library.text(title, {context: 1}, function() { if (this.isMounted()) { this.setState({}); } }.bind(this));
    }

    var centerContent = this.props.multiPanel && mode === "Connections" ?
      (React.createElement("div", {className: "readerTextToc"}, 
          React.createElement("span", {className: "en"}, "Select Connection"), 
          React.createElement("span", {className: "he"}, "בחר חיבור")
        )) :
      (React.createElement("div", {className: "readerTextToc", onClick: this.props.openMenu.bind(null, "text toc")}, 
           title ? (React.createElement("i", {className: "fa fa-caret-down invisible"})) : null, 
          React.createElement("div", {className: "readerTextTocBox"}, 
            React.createElement("span", {className: "en"}, title), 
            React.createElement("span", {className: "he"}, heTitle)
          ), 
           title ? (React.createElement("i", {className: "fa fa-caret-down"})) : null
        ));

    var classes = classNames({readerControls: 1, headeroom: 1, connectionsHeader: mode == "Connections"});
    var readerControls = hideHeader ? null :
        (React.createElement("div", {className: classes}, 
          React.createElement("div", {className: "leftButtons"}, 
            this.props.closePanel ? (React.createElement(ReaderNavigationMenuCloseButton, {icon: mode === "Connections" ? "arrow": null, onClick: this.props.closePanel})) : null, 
            React.createElement(ReaderNavigationMenuSearchButton, {onClick: this.props.openMenu.bind(null, "navigation")})
          ), 
          centerContent, 
          React.createElement("div", {className: "rightButtons"}, 
            React.createElement(ReaderNavigationMenuDisplaySettingsButton, {onClick: this.props.openDisplaySettings})
          )
        ));
    return (
      React.createElement("div", null, 
        React.createElement(CategoryColorLine, {category: this.props.currentCategory()}), 
        readerControls
      )
    );
  }
});


var ReaderDisplayOptionsMenu = React.createClass({displayName: "ReaderDisplayOptionsMenu",
  propTyps: {
    setOption:     React.PropTypes.func.isRequired,
    settings:      React.PropTypes.object.isRequired,
    currentLayout: React.PropTypes.func.isRequired,
    menuOpen:      React.PropTypes.string.isRequired
  },
  render: function() {
    var languageOptions = [
      {name: "english",   content: "<span class='en'>A</span>" },
      {name: "bilingual", content: "<span class='en'>A</span><span class='he'>א</span>" },
      {name: "hebrew",    content: "<span class='he'>א</span>" }
    ];
    var languageToggle = (
        React.createElement(ToggleSet, {
          name: "language", 
          options: languageOptions, 
          setOption: this.props.setOption, 
          settings: this.props.settings}));
    
    var layoutOptions = [
      {name: "continuous", fa: "align-justify" },
      {name: "segmented", fa: "align-left" },
    ];
    var layoutToggle = this.props.settings.language !== "bilingual" ? 
      (React.createElement(ToggleSet, {
          name: "layout", 
          options: layoutOptions, 
          setOption: this.props.setOption, 
          currentLayout: this.props.currentLayout, 
          settings: this.props.settings})) : null;

    var colorOptions = [
      {name: "light", content: "" },
      {name: "sepia", content: "" },
      {name: "dark", content: "" }
    ];
    var colorToggle = (
        React.createElement(ToggleSet, {
          name: "color", 
          separated: true, 
          options: colorOptions, 
          setOption: this.props.setOption, 
          settings: this.props.settings}));

    var sizeOptions = [
      {name: "smaller", content: "Aa" },
      {name: "larger", content: "Aa"  }
    ];
    var sizeToggle = (
        React.createElement(ToggleSet, {
          name: "fontSize", 
          options: sizeOptions, 
          setOption: this.props.setOption, 
          settings: this.props.settings}));

    if (this.props.menuOpen === "search") {
      return (React.createElement("div", {className: "readerOptionsPanel"}, 
              languageToggle, 
              React.createElement("div", {className: "line"}), 
              sizeToggle
            ));
    } else if (this.props.menuOpen) {
      return (React.createElement("div", {className: "readerOptionsPanel"}, 
              languageToggle
            ));
    } else {
      return (React.createElement("div", {className: "readerOptionsPanel"}, 
                languageToggle, 
                layoutToggle, 
                React.createElement("div", {className: "line"}), 
                colorToggle, 
                sizeToggle
              ));
    }
  }
});


var ReaderNavigationMenu = React.createClass({displayName: "ReaderNavigationMenu",
  // The Navigation menu for broswing and searching texts, plus site links.
  propTypes: {
    home:          React.PropTypes.bool,
    categories:    React.PropTypes.array.isRequired,
    setCategories: React.PropTypes.func.isRequired,
    closeNav:      React.PropTypes.func.isRequired,
    openNav:       React.PropTypes.func.isRequired,
    openSearch:    React.PropTypes.func.isRequired,
    showBaseText:  React.PropTypes.func.isRequired
  },
  getInitialState: function() {
    return {
      showMore: false,
    };
  },
  componentDidMount: function() {
    this.setWidth();
    window.addEventListener("resize", this.setWidth);
  },
  componentWillUnmount: function() {
    window.removeEventListener("resize", this.setWidth);
  },
  setWidth: function() {
    var width = $(ReactDOM.findDOMNode(this)).width();
    this.setState({width: width});
  },
  navHome: function() {
    this.props.setCategories([])
    this.props.openNav();
  },
  closeNav: function() {
    this.props.setCategories([])
    this.props.closeNav();
  },
  showMore: function() {
    this.setState({showMore: true});
  },
  handleClick: function(event) {
    if ($(event.target).hasClass("refLink") || $(event.target).parent().hasClass("refLink")) {
      var ref = $(event.target).attr("data-ref") || $(event.target).parent().attr("data-ref");
      this.props.showBaseText(ref);
      sjs.track.event("Reader", "Navigation Text Click", ref)
    } else if ($(event.target).hasClass("catLink") || $(event.target).parent().hasClass("catLink")) {
      var cats = $(event.target).attr("data-cats") || $(event.target).parent().attr("data-cats");
      cats = cats.split("|");
      this.props.setCategories(cats);
      sjs.track.event("Reader", "Navigation Sub Category Click", cats.join(" / "));
    }  
  },
  handleSearchKeyUp: function(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      //window.location = "/search?q=" + query.replace(/ /g, "+");
      this.props.openSearch(query);
    }
  },
  handleSearchButtonClick: function(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".readerSearch").val();
    if (query) {
      this.props.openSearch(query);
    }
  },  
  render: function() {
    if (this.props.categories.length) {
      return (React.createElement("div", {className: "readerNavMenu", onClick: this.handleClick}, 
                React.createElement(ReaderNavigationCategoryMenu, {
                  categories: this.props.categories, 
                  category: this.props.categories.slice(-1)[0], 
                  closeNav: this.closeNav, 
                  setCategories: this.props.setCategories, 
                  openDisplaySettings: this.props.openDisplaySettings, 
                  navHome: this.navHome})
              ));
    } else {
      var categories = [
        "Tanach",
        "Mishnah",
        "Talmud",
        "Midrash",
        "Halakhah",
        "Kabbalah",
        "Liturgy",
        "Philosophy",
        "Tosefta",
        "Parshanut",
        "Chasidut",
        "Musar",
        "Responsa",
        "Apocrypha",
        "Other"
      ];
      categories = categories.map(function(cat) {
        var style = {"borderColor": sjs.categoryColor(cat)};
        var openCat = function() {this.props.setCategories([cat])}.bind(this);
        var heCat   = sjs.library.hebrewCategory(cat);
        return (React.createElement("div", {className: "readerNavCategory", style: style, onClick: openCat}, 
                  React.createElement("span", {className: "en"}, cat), 
                  React.createElement("span", {className: "he"}, heCat)
                ));
      }.bind(this));;
      var more = (React.createElement("div", {className: "readerNavCategory", style: {"borderColor": sjs.palette.darkblue}, onClick: this.showMore}, 
                      React.createElement("span", {className: "en"}, "More >"), 
                      React.createElement("span", {className: "he"}, "עוד >")
                  ));
      if (this.state.width < 450) {
        categories = this.state.showMore ? categories : categories.slice(0,9).concat(more);
        categories = (React.createElement("div", {className: "readerNavCategories"}, React.createElement(TwoBox, {content: categories})));
      } else {
        categories = this.state.showMore ? categories : categories.slice(0,8).concat(more);
        categories = (React.createElement("div", {className: "readerNavCategories"}, React.createElement(ThreeBox, {content: categories})));
      }
                    

      var siteLinks = sjs._uid ? 
                    [(React.createElement("a", {className: "siteLink", key: "profile", href: "/my/profile"}, 
                        React.createElement("i", {className: "fa fa-user"}), 
                        React.createElement("span", {className: "en"}, "Your Profile"), 
                        React.createElement("span", {className: "he"}, "הפרופיל שלך")
                      )), 
                     (React.createElement("span", {className: "divider", key: "d1"}, "•")),
                     (React.createElement("a", {className: "siteLink", key: "about", href: "/about"}, 
                        React.createElement("span", {className: "en"}, "About Sefaria"), 
                        React.createElement("span", {className: "he"}, "אודות ספאריה")
                      )),
                     (React.createElement("span", {className: "divider", key: "d2"}, "•")),
                     (React.createElement("a", {className: "siteLink", key: "logout", href: "/logout"}, 
                        React.createElement("span", {className: "en"}, "Logout"), 
                        React.createElement("span", {className: "he"}, "התנתק")
                      ))] :
                    
                    [(React.createElement("a", {className: "siteLink", key: "about", href: "/about"}, 
                        React.createElement("span", {className: "en"}, "About Sefaria"), 
                        React.createElement("span", {className: "he"}, "אודות ספאריה")
                      )),
                     (React.createElement("span", {className: "divider", key: "d1"}, "•")),
                     (React.createElement("a", {className: "siteLink", key: "login", href: "/login"}, 
                        React.createElement("span", {className: "en"}, "Sign In"), 
                        React.createElement("span", {className: "he"}, "הירשם")
                      ))];

      var tanachStyle = {"borderColor": sjs.categoryColor("Tanach")};
      var talmudStyle = {"borderColor": sjs.categoryColor("Talmud")};
      var calendar = [(React.createElement("a", {className: "calendarLink refLink", "data-ref": sjs.calendar.parasha, style: tanachStyle, key: "parasha"}, 
                        React.createElement("span", {className: "en"}, sjs.calendar.parashaName), 
                        React.createElement("span", {className: "he"}, "פרשה")
                       )),
                      (React.createElement("a", {className: "calendarLink refLink", "data-ref": sjs.calendar.haftara, style: tanachStyle, key: "haftara"}, 
                        React.createElement("span", {className: "en"}, "Haftara"), 
                        React.createElement("span", {className: "he"}, "הפטרה")
                       )),
                      (React.createElement("a", {className: "calendarLink refLink", "data-ref": sjs.calendar.daf_yomi, style: talmudStyle, key: "dafyomi"}, 
                        React.createElement("span", {className: "en"}, "Daf Yomi"), 
                        React.createElement("span", {className: "he"}, "דף יומי")
                       ))];
      if (this.state.width < 450) {
        calendar = (React.createElement("div", {className: "readerNavCalendar"}, React.createElement(TwoBox, {content: calendar})));
      } else {
        calendar = (React.createElement("div", {className: "readerNavCalendar"}, React.createElement(ThreeBox, {content: calendar})));
      }
      var topContent = this.props.home ?
              (React.createElement("div", {className: "readerNavTop search"}, 
                React.createElement(CategoryColorLine, {category: "Other"}), 
                React.createElement(ReaderNavigationMenuSearchButton, {onClick: this.navHome}), 
                React.createElement(ReaderNavigationMenuDisplaySettingsButton, {onClick: this.props.openDisplaySettings}), 
                React.createElement("div", {className: "sefariaLogo"}, React.createElement("img", {src: "/static/img/sefaria.png"}))
              )) :
              (React.createElement("div", {className: "readerNavTop search"}, 
                React.createElement(CategoryColorLine, {category: "Other"}), 
                React.createElement(ReaderNavigationMenuCloseButton, {onClick: this.closeNav}), 
                React.createElement(ReaderNavigationMenuSearchButton, {onClick: this.handleSearchButtonClick}), 
                React.createElement(ReaderNavigationMenuDisplaySettingsButton, {onClick: this.props.openDisplaySettings}), 
                React.createElement("input", {className: "readerSearch", placeholder: "Search", onKeyUp: this.handleSearchKeyUp})
              ));

      var classes     = classNames({readerNavMenu: 1, readerNavMenu:1, home: this.props.home});
      var sheetsStyle = {"borderColor": sjs.categoryColor("Sheets")};

      return(React.createElement("div", {className: classes, onClick: this.handleClick, key: "0"}, 
              topContent, 
              React.createElement("div", {className: "content"}, 
                React.createElement("div", {className: "contentInner"}, 
                  this.props.home ? (React.createElement("div", {className: "tagline"}, 
                                        React.createElement("span", {className: "en"}, "A Living Library of Jewish Texts"), 
                                        React.createElement("span", {className: "he"}, "ספריה חיה של טקסטים יהודיים")
                                      )) : (React.createElement("div", {className: "tagline"})), 
                  React.createElement("h2", null, 
                    React.createElement("span", {className: "en"}, "Browse Texts"), 
                    React.createElement("span", {className: "he"}, "טקסטים")
                  ), 
                  categories, 
                  React.createElement("h2", null, 
                    React.createElement("span", {className: "en"}, "Calendar"), 
                    React.createElement("span", {className: "he"}, "לוח יומי")
                  ), 
                  calendar, 
                  React.createElement("h2", null, 
                    React.createElement("span", {className: "en"}, "Community"), 
                    React.createElement("span", {className: "he"}, "קהילה")
                  ), 
                  React.createElement("span", {className: "sheetsLink", style: sheetsStyle, onClick: this.props.openMenu.bind(null, "sheets")}, 
                    React.createElement("i", {className: "fa fa-file-text-o"}), 
                    React.createElement("span", {className: "en"}, "Source Sheets"), 
                    React.createElement("span", {className: "he"}, "דפי מקורות")
                  ), 
                  React.createElement("div", {className: "siteLinks"}, 
                  siteLinks
                  )
                )
              )
            ));
    }
  }
});


var ReaderNavigationCategoryMenu = React.createClass({displayName: "ReaderNavigationCategoryMenu",
  // Navigation Menu for a single category of texts (e.g., "Tanakh", "Bavli")
  propTypes: {
    category:      React.PropTypes.string.isRequired,
    categories:    React.PropTypes.array.isRequired,
    closeNav:      React.PropTypes.func.isRequired,
    setCategories: React.PropTypes.func.isRequired,
    navHome:       React.PropTypes.func.isRequired
  },
  render: function() {

    // Show Talmud with Toggles
    var categories  = this.props.categories[0] === "Talmud" && this.props.categories.length == 1 ? 
                        ["Talmud", "Bavli"] : this.props.categories;

    if (categories[0] === "Talmud") {
      var setBavli = function() {
        this.props.setCategories(["Talmud", "Bavli"]);
      }.bind(this);
      var setYerushalmi = function() {
        this.props.setCategories(["Talmud", "Yerushalmi"]);
      }.bind(this);
      var bClasses = classNames({navToggle:1, active: categories[1] === "Bavli"});
      var yClasses = classNames({navToggle:1, active: categories[1] === "Yerushalmi", second: 1});

      var toggle =(React.createElement("div", {className: "navToggles"}, 
                            React.createElement("span", {className: bClasses, onClick: setBavli}, 
                              React.createElement("span", {className: "en"}, "Bavli"), 
                              React.createElement("span", {className: "he"}, "בבלי")
                            ), 
                            React.createElement("span", {className: "navTogglesDivider"}, "|"), 
                            React.createElement("span", {className: yClasses, onClick: setYerushalmi}, 
                              React.createElement("span", {className: "en"}, "Yerushalmi"), 
                              React.createElement("span", {className: "he"}, "ירושלמי")
                            )
                         ));

    } else {
      var toggle = "";
    }

    var catContents = sjs.library.tocItemsByCategories(categories);

    return (React.createElement("div", {className: "readerNavCategoryMenu readerNavMenu"}, 
              React.createElement("div", {className: "readerNavTop searchOnly"}, 
                React.createElement(CategoryColorLine, {category: categories[0]}), 
                React.createElement(ReaderNavigationMenuSearchButton, {onClick: this.props.navHome}), 
                React.createElement(ReaderNavigationMenuDisplaySettingsButton, {onClick: this.props.openDisplaySettings}), 
                React.createElement("h2", null, 
                  React.createElement("span", {className: "en"}, this.props.category), 
                  React.createElement("span", {className: "he"}, sjs.library.hebrewCategory(this.props.category))
                )
              ), 
              React.createElement("div", {className: "content"}, 
                React.createElement("div", {className: "contentInner"}, 
                  toggle, 
                  React.createElement(ReaderNavigationCategoryMenuContents, {contents: catContents, categories: categories})
                )
              )
            ));
  }
});


var ReaderNavigationCategoryMenuContents = React.createClass({displayName: "ReaderNavigationCategoryMenuContents",
  // Inner content of Category menu (just category title and boxes of)
  propTypes: {
    contents:   React.PropTypes.array.isRequired,
    categories: React.PropTypes.array.isRequired
  },
  render: function() {
      var content = [];
      cats = this.props.categories || [];
      for (var i = 0; i < this.props.contents.length; i++) {
        var item = this.props.contents[i];
        if (item.category) {
          if (item.category == "Commentary") { continue; }
          var newCats = cats.concat(item.category);
          // Special Case categories which should nest
          var subcats = [ "Mishneh Torah", "Shulchan Arukh", "Midrash Rabbah", "Maharal" ];
          if ($.inArray(item.category, subcats) > -1) {
            content.push((React.createElement("span", {className: "catLink", "data-cats": newCats.join("|"), key: i}, 
                           React.createElement("span", {className: "en"}, item.category), 
                           React.createElement("span", {className: "he"}, sjs.library.hebrewCategory(item.category))
                          )));
            continue;
          }
          // Add a Category
          content.push((React.createElement("div", {className: "category", key: i}, 
                          React.createElement("h3", null, 
                            React.createElement("span", {className: "en"}, item.category), 
                            React.createElement("span", {className: "he"}, item.heCategory)
                          ), 
                          React.createElement(ReaderNavigationCategoryMenuContents, {contents: item.contents, categories: newCats})
                        )));
        } else {
          // Add a Text
          var title   = item.title.replace(/(Mishneh Torah,|Shulchan Arukh,|Jerusalem Talmud) /, "");
          var heTitle = item.heTitle.replace(/(משנה תורה,|תלמוד ירושלמי) /, "");
          content.push((React.createElement("span", {className: 'refLink sparse' + item.sparseness, "data-ref": item.firstSection, key: i}, 
                          React.createElement("span", {className: "en"}, title), 
                          React.createElement("span", {className: "he"}, heTitle)
                        )));
        }
      }
      var boxedContent = [];
      var currentRun   = [];
      for (var i = 0; i < content.length; i++) {
        // Walk through content looking for runs of spans to group togther into a table
        if (content[i].type == "div") { // this is a subcategory
          if (currentRun.length) {
            boxedContent.push((React.createElement(TwoBox, {contents: currentRun, key: i})));
            currentRun = [];
          }
          boxedContent.push(content[i]);
        } else if (content[i].type == "span") { // this is a single text
          currentRun.push(content[i]);
        }
      }
      if (currentRun.length) {
        boxedContent.push((React.createElement(TwoBox, {content: currentRun, key: i})));
      }
      return (React.createElement("div", null, boxedContent));
  }
});


var ReaderTextTableOfContents = React.createClass({displayName: "ReaderTextTableOfContents",
  // Menu for the Table of Contents for a single text
  propTypes: {
    text:         React.PropTypes.string.isRequired,
    category:     React.PropTypes.string.isRequired,
    currentRef:   React.PropTypes.string.isRequired,
    close:        React.PropTypes.func.isRequired,
    openNav:      React.PropTypes.func.isRequired,
    showBaseText: React.PropTypes.func.isRequired
  },
  componentDidMount: function() {
    this.bindToggles();
    this.shrinkWrap();
    window.addEventListener('resize', this.shrinkWrap);
  },
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.shrinkWrap);
  },
  componentDidUpdate: function() {
    this.bindToggles();
    this.shrinkWrap();
  },
  handleClick: function(e) {
    var $a = $(e.target).closest("a");
    if ($a.length) {
      var ref = $a.attr("data-ref");
      ref = decodeURIComponent(ref);
      ref = humanRef(ref);
      this.props.close();
      this.props.showBaseText(ref);
      e.preventDefault();
    }
  },
  bindToggles: function() {
    // Toggling TOC Alt structures
    var component = this;
    $(".altStructToggle").click(function(){
        $(".altStructToggle").removeClass("active");
        $(this).addClass("active");
        var i = $(this).closest("#structToggles").find(".altStructToggle").index(this);
        $(".altStruct").hide();
        $(".altStruct").eq(i).show();
        component.shrinkWrap();
    });    
  },
  shrinkWrap: function() {
    // Shrink the width of the container of a grid of inline-line block elements,
    // so that is is tight around its contents thus able to appear centered. 
    // As far as I can tell, there's no way to do this in pure CSS.
    var shrink  = function(i, container) {
      var $container = $(container);
      // don't run on complex nodes without sectionlinks
      if ($container.hasClass("schema-node-toc") && !$container.find(".sectionLink").length) { return; } 
      var maxWidth   = $container.parent().innerWidth();
      var itemWidth  = $container.find(".sectionLink").outerWidth(true);
      var nItems     = $container.find(".sectionLink").length;

      if (maxWidth / itemWidth > nItems) {
        var width = nItems * itemWidth;
      } else {
        var width = Math.floor(maxWidth / itemWidth) * itemWidth;
      }
      $container.width(width + "px");
    };
    var $root = $(ReactDOM.findDOMNode(this)).find(".altStruct:visible");
    $root = $root.length ? $root : $(ReactDOM.findDOMNode(this)).find(".tocContent");
    if ($root.find(".tocSection").length) {             // nested simple text
      //$root.find(".tocSection").each(shrink); // Don't bother with these for now
    } else if ($root.find(".schema-node-toc").length) { // complex text or alt struct
      $root.find(".schema-node-toc, .schema-node-contents").each(shrink); 
    } else {
      $root.find(".tocLevel").each(shrink);             // Simple text, no nesting
    }
  },
  render: function() {
    var tocHtml = sjs.library.textTocHtml(this.props.text, function() {
      this.setState({});
    }.bind(this));
    tocHtml = tocHtml || '<div class="loadingMessage"><span class="en">Loading...</span><span class="he">טעינה...</span></div>';

    var title     = this.props.text;
    var heTitle   = sjs.library.index(title) ? sjs.library.index(title).heTitle : title;

    var section   = sjs.library.sectionString(this.props.currentRef).en.named;
    var heSection = sjs.library.sectionString(this.props.currentRef).he.named;

    return (React.createElement("div", {className: "readerTextTableOfContents readerNavMenu", onClick: this.handleClick}, 
              React.createElement("div", {className: "readerNavTop"}, 
                React.createElement(CategoryColorLine, {category: this.props.category}), 
                React.createElement(ReaderNavigationMenuCloseButton, {onClick: this.props.close}), 
                React.createElement(ReaderNavigationMenuDisplaySettingsButton, {onClick: this.props.openDisplaySettings}), 
                React.createElement("h2", null, 
                  React.createElement("span", {className: "en"}, "Table of Contents"), 
                  React.createElement("span", {className: "he"}, "תוכן העניינים")
                )
              ), 
              React.createElement("div", {className: "content"}, 
                React.createElement("div", {className: "contentInner"}, 
                  React.createElement("div", {className: "tocTitle"}, 
                    React.createElement("span", {className: "en"}, title), 
                    React.createElement("span", {className: "he"}, heTitle), 
                    React.createElement("div", {className: "currentSection"}, 
                      React.createElement("span", {className: "en"}, section), 
                      React.createElement("span", {className: "he"}, heSection)
                    )
                  ), 
                  React.createElement("div", {className: "tocContent", dangerouslySetInnerHTML:  {__html: tocHtml} })
                )
              )
            ));
  }
});


var SheetsNav = React.createClass({displayName: "SheetsNav",
  // Navigation for Sheets
  propTypes: {
    initialTag:   React.PropTypes.string,
    close:        React.PropTypes.func.isRequired,
    openNav:      React.PropTypes.func.isRequired,
    setSheetTag:  React.PropTypes.func.isRequired
  },
  getInitialState: function() {
    return {
      trendingTags: null,
      tagList: null,
      yourSheets: null,
      sheets: [],
      tag: this.props.initialTag
    };
  },
  componentDidMount: function() {
    this.getTags();
    if (this.props.initialTag) {
      if (this.props.initialTag === "Your Sheets") {
        this.showYourSheets();
      } else {
        this.setTag(this.props.initialTag);
      }
    }
  },
  componentWillReceiveProps: function(nextProps) {
    this.setState({tag: nextProps.initialTag, sheets: []});
  },
  getTags: function() {
    sjs.library.sheets.trendingTags(this.loadTags);
    sjs.library.sheets.tagList(this.loadTags);
  },
  loadTags: function() {
    this.setState({
      trendingTags: sjs.library.sheets.trendingTags() || [],
      tagList:      sjs.library.sheets.tagList() || []
    });
  },
  setTag: function(tag) {
    this.setState({tag: tag});
    sjs.library.sheets.sheetsByTag(tag, this.loadSheets);
    this.props.setSheetTag(tag);
  },
  loadSheets: function(sheets) {
    this.setState({sheets: sheets});
  },
  showYourSheets: function() {
    this.setState({tag: "Your Sheets"});
    sjs.library.sheets.userSheets(sjs._uid, this.loadSheets);
    this.props.setSheetTag("Your Sheets");    
  },
  render: function() {
    var enTitle = this.state.tag || "Source Sheets";

    if (this.state.tag) {
      var sheets = this.state.sheets.map(function(sheet) {
        var title = sheet.title.stripHtml();
        var url   = "/sheets/" + sheet.id;
        return (React.createElement("a", {className: "sheet", href: url, key: url}, 
                  sheet.ownerImageUrl ? (React.createElement("img", {className: "sheetImg", src: sheet.ownerImageUrl})) : null, 
                  React.createElement("span", {className: "sheetViews"}, React.createElement("i", {className: "fa fa-eye"}), " ", sheet.views), 
                  React.createElement("div", {className: "sheetAuthor"}, sheet.ownerName), 
                  React.createElement("div", {className: "sheetTitle"}, title)
                ));
      });
      sheets = sheets.length ? sheets : (React.createElement(LoadingMessage, null));
      var content = (React.createElement("div", {className: "content sheetList"}, React.createElement("div", {className: "contentInner"}, sheets)));
    } else {
      var yourSheets  = sjs._uid ? (React.createElement("div", {className: "yourSheetsLink navButton", onClick: this.showYourSheets}, "Your Source Sheets ", React.createElement("i", {className: "fa fa-chevron-right"}))) : null;
      var makeTagButton = function(tag) {
        var setThisTag = this.setTag.bind(null, tag.tag);
        return (React.createElement("div", {className: "navButton", onClick: setThisTag, key: tag.tag}, tag.tag, " (", tag.count, ")"));
      }.bind(this);

      if (this.state.trendingTags !== null && this.state.tagList !== null) {
        var trendingTags = this.state.trendingTags.slice(0,6).map(makeTagButton);
        var tagList      = this.state.tagList.map(makeTagButton);
        var content = (React.createElement("div", {className: "content"}, 
                        React.createElement("div", {className: "contentInner"}, 
                          yourSheets, 
                          React.createElement("h2", null, React.createElement("span", {className: "en"}, "Trending Tags")), 
                          trendingTags, 
                          React.createElement("br", null), React.createElement("br", null), 
                          React.createElement("h2", null, React.createElement("span", {className: "en"}, "All Tags")), 
                          tagList
                        )
                       ));
      } else {
        var content = (React.createElement("div", {className: "content", key: "content"}, React.createElement("div", {className: "contentInner"}, React.createElement(LoadingMessage, null))));
      }      
    }

    return (React.createElement("div", {className: "readerSheetsNav readerNavMenu"}, 
              React.createElement("div", {className: "readerNavTop searchOnly", key: "navTop"}, 
                React.createElement(CategoryColorLine, {category: "Sheets"}), 
                React.createElement(ReaderNavigationMenuSearchButton, {onClick: this.props.openNav}), 
                React.createElement("h2", null, React.createElement("span", {className: "en"}, enTitle))
              ), 
              content
            ));
  }
});


var ToggleSet = React.createClass({displayName: "ToggleSet",
  // A set of options grouped together.
  propTypes: {
    name:          React.PropTypes.string.isRequired,
    setOption:     React.PropTypes.func.isRequired,
    currentLayout: React.PropTypes.func,
    settings:      React.PropTypes.object.isRequired,
    options:       React.PropTypes.array.isRequired,
    separated:     React.PropTypes.bool
  },
  getInitialState: function() {
    return {};
  },
  render: function() {
    var classes = {toggleSet: 1, separated: this.props.separated };
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var value = this.props.name === "layout" ? this.props.currentLayout() : this.props.settings[this.props.name];
    var width = 100.0 - (this.props.separated ? (this.props.options.length - 1) * 3 : 0);
    var style = {width: (width/this.props.options.length) + "%"};
    return (
      React.createElement("div", {className: classes}, 
        
          this.props.options.map(function(option) {
            return (
              React.createElement(ToggleOption, {
                name: option.name, 
                key: option.name, 
                set: this.props.name, 
                on: value == option.name, 
                setOption: this.props.setOption, 
                style: style, 
                image: option.image, 
                fa: option.fa, 
                content: option.content}));
          }.bind(this))
        
      ));
  }
});


var ToggleOption = React.createClass({displayName: "ToggleOption",
  // A single option in a ToggleSet
  getInitialState: function() {
    return {};
  },
  handleClick: function() {
    this.props.setOption(this.props.set, this.props.name);
    sjs.track.event("Reader", "Display Option Click", this.props.set + " - " + this.props.name);
  },
  render: function() {
    var classes = {toggleOption: 1, on: this.props.on };
    classes[this.props.name] = 1;
    classes = classNames(classes);
    var content = this.props.image ? (React.createElement("img", {src: this.props.image})) : 
                    this.props.fa ? (React.createElement("i", {className: "fa fa-" + this.props.fa})) : 
                      (React.createElement("span", {dangerouslySetInnerHTML:  {__html: this.props.content} }));
    return (
      React.createElement("div", {
        className: classes, 
        style: this.props.style, 
        onClick: this.handleClick}, 
        content
      ));
  }
});


var ReaderNavigationMenuSearchButton = React.createClass({displayName: "ReaderNavigationMenuSearchButton",
  render: function() { 
    return (React.createElement("div", {className: "readerNavMenuSearchButton", onClick: this.props.onClick}, React.createElement("i", {className: "fa fa-search"})));
  }
});


var ReaderNavigationMenuCloseButton = React.createClass({displayName: "ReaderNavigationMenuCloseButton",
  render: function() { 
    var icon = this.props.icon === "arrow" ? (React.createElement("i", {className: "fa fa-caret-left"})) : "×";
    var classes = classNames({readerNavMenuCloseButton: 1, arrow: this.props.icon === "arrow"});
    return (React.createElement("div", {className: classes, onClick: this.props.onClick}, icon));
  }
});


var ReaderNavigationMenuDisplaySettingsButton = React.createClass({displayName: "ReaderNavigationMenuDisplaySettingsButton",
  render: function() { 
    return (React.createElement("div", {className: "readerOptions", onClick: this.props.onClick}, React.createElement("img", {src: "/static/img/bilingual2.png"})));
  }
});


var CategoryColorLine = React.createClass({displayName: "CategoryColorLine",
  render: function() {
    style = {backgroundColor: sjs.categoryColor(this.props.category)};
    return (React.createElement("div", {className: "categoryColorLine", style: style}));
  }
})


var TextColumn = React.createClass({displayName: "TextColumn",
  // An infinitely scrollable column of text, composed of TextRanges for each section.
  propTypes: {
    srefs:                 React.PropTypes.array.isRequired,
    highlightedRefs:       React.PropTypes.array,
    basetext:              React.PropTypes.bool,
    withContext:           React.PropTypes.bool,
    loadLinks:             React.PropTypes.bool,
    prefetchNextPrev:      React.PropTypes.bool,
    openOnClick:           React.PropTypes.bool,
    lowlight:              React.PropTypes.bool,
    multiPanel:            React.PropTypes.bool,
    mode:                  React.PropTypes.string,
    settings:              React.PropTypes.object,
    showBaseText:          React.PropTypes.func,
    updateTextColumn:      React.PropTypes.func,
    onSegmentClick:    React.PropTypes.func,
    onCitationClick:       React.PropTypes.func,
    setTextListHightlight: React.PropTypes.func,
    onTextLoad:            React.PropTypes.func,
    panelsOpen:            React.PropTypes.number
  },
  componentDidMount: function() {
    this.initialScrollTopSet = false;
    this.justTransitioned    = true;
    this.debouncedAdjustTextListHighlight = debounce(this.adjustTextListHighlight, 100);
    var node = ReactDOM.findDOMNode(this);
    node.addEventListener("scroll", this.handleScroll);
    this.adjustInfiniteScroll();
  },
  componentWillUnmount: function() {
    var node = ReactDOM.findDOMNode(this);
    node.removeEventListener("scroll", this.handleScroll);
  },
  componentWillReceiveProps: function(nextProps) {
    if (this.props.mode === "Text" && nextProps.mode === "TextAndConnections") {
      // When moving into text and connections, scroll to highlighted
      this.justTransitioned    = true;
      this.scrolledToHighlight = false;
      this.initialScrollTopSet = true;

    } else if (this.props.mode === "TextAndConnections" && nextProps.mode === "TextAndConnections") {
      // Don't mess with scroll position within Text and Connections mode
      if (this.justTransitioned) {
        this.justTransitioned = false;
      } else if (!this.initialScrollTopSet) {
        this.scrolledToHighlight = true;

      }
    } else if (this.props.mode === "TextAndConnections" && nextProps.mode === "Text") {
      // Don't mess with scroll position within Text and Connections mode
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;

    } else if (this.props.panelsOpen !== nextProps.panelsOpen) {
      this.scrolledToHighlight = false;
    } else if (nextProps.srefs.length == 1 && $.inArray(nextProps.srefs[0], this.props.srefs) == -1) {
      // If we are switching to a single ref not in the current TextColumn, treat it as a fresh open.
      this.initialScrollTopSet = false;
      this.scrolledToHighlight = false;
      this.loadingContentAtTop = false;
    }
  },
  componentDidUpdate: function(prevProps, prevState) {
    if (!this.props.highlightedRefs.compare(prevProps.highlightedRefs)) {
      this.setScrollPosition();  // highlight change
    }
  },
  handleScroll: function(event) {
    if (this.justScrolled) {
      this.justScrolled = false;
      return;
    }
    if (this.props.highlightedRefs.length) {
      this.debouncedAdjustTextListHighlight();
    }
    this.adjustInfiniteScroll();   
  },
  handleTextSelection: function() {
    var selection = window.getSelection();
    if (selection.type === "Range") {
      var $start    = $(getSelectionBoundaryElement(true)).closest(".segment");
      var $end      = $(getSelectionBoundaryElement(false)).closest(".segment");
      var $segments = $start.is($end) ? $start : $start.nextUntil($end, ".segment").add($start).add($end);
      var refs      = [];
 
      $segments.each(function() {
        refs.push($(this).attr("data-ref"));
      });

      this.props.setTextListHightlight(refs);
    }
  },
  handleTextLoad: function() {
    if (this.loadingContentAtTop || !this.initialScrollTopSet) {
      this.setScrollPosition();
    }
  },
  setScrollPosition: function() {
    // console.log("ssp")
    if (this.test) {}
    // Called on every update, checking flags on this to see if scroll position needs to be set
    if (this.loadingContentAtTop) {
      // After adding content by infinite scrolling up, scroll back to what the user was just seeing
      // console.log("loading at top")
      var $node   = $(ReactDOM.findDOMNode(this));
      var adjust  = 118; // Height of .loadingMessage.base
      var $texts  = $node.find(".basetext");
      if ($texts.length < 2) { return; }
      var top     = $texts.eq(1).position().top + $node.scrollTop() - adjust;
      if (!$texts.eq(0).hasClass("loading")) {
        this.loadingContentAtTop = false;
        this.initialScrollTopSet = true;
        this.justScrolled = true;
        ReactDOM.findDOMNode(this).scrollTop = top;
        //console.log(top)
      }
    } else if (!this.scrolledToHighlight && $(ReactDOM.findDOMNode(this)).find(".segment.highlight").length) {
       // console.log("scroll to highlighted")
      // scroll to highlighted segment
      this.scrollToHighlighted();
      this.scrolledToHighlight = true;
      this.initialScrollTopSet = true;
    } else if (!this.initialScrollTopSet) {
      //console.log("initial scroll to 30")
      // initial value set below 0 so you can scroll up for previous
      var node = ReactDOM.findDOMNode(this);
      node.scrollTop = 30;
      this.initialScrollTopSet = true;
    }
  },
  adjustInfiniteScroll: function() {
    // Add or remove TextRanges from the top or bottom, depending on scroll position
    window.requestAnimationFrame(function() {
      if (!this.isMounted()) { return; }
      var node         = ReactDOM.findDOMNode(this);
      var refs         = this.props.srefs;
      var $lastText    = $(node).find(".textRange.basetext").last();
      if (!$lastText.length) { return; }
      var lastTop      = $lastText.position().top;
      var lastBottom   = lastTop + $lastText.outerHeight();
      var windowHeight = $(node).outerHeight();
      var windowTop    = node.scrollTop;
      var windowBottom = windowTop + windowHeight;
      if (lastTop > (windowHeight + 100) && refs.length > 1) { 
        // Remove a section scrolled out of view on bottom
        refs = refs.slice(0,-1);
        this.props.updateTextColumn(refs);
      } else if ( lastBottom < windowHeight + 80 ) {
        // Add the next section to bottom
        if ($lastText.hasClass("loading")) { 
          return;
        }
        currentRef = refs.slice(-1)[0];
        data       = sjs.library.ref(currentRef);
        if (data && data.next) {
          refs.push(data.next);
          this.props.updateTextColumn(refs);
        }
        sjs.track.event("Reader", "Infinite Scroll", "Down");
      } else if (windowTop < 20) {
        // Scroll up for previous
        topRef = refs[0];
        data   = sjs.library.ref(topRef);
        if (data && data.prev) {
          //console.log("up!")
          refs.splice(refs, 0, data.prev);
          this.loadingContentAtTop = true;
          this.props.updateTextColumn(refs);
        }
        sjs.track.event("Reader", "Infinite Scroll", "Up");
      } else {
        // nothing happens
      }
    }.bind(this));
  },
  adjustTextListHighlight: function() {
    // When scrolling while the TextList is open, update which segment should be highlighted.
    window.requestAnimationFrame(function() {
      //var start = new Date();
      if (!this.isMounted()) { return; }
      var $container   = $(ReactDOM.findDOMNode(this));
      var $readerPanel = $container.closest(".readerPanel");
      var viewport     = $container.outerHeight() - $readerPanel.find(".textList").outerHeight();
      var center       = (viewport/2);
      var midTop       = 200;
      var threshhold   = this.props.multiPanel ? midTop : center;
      $container.find(".basetext .segment").each(function(i, segment) {
        var $segment = $(segment);
        if ($segment.offset().top + $segment.outerHeight() > threshhold) {
          var ref = $segment.attr("data-ref");
          this.props.setTextListHightlight(ref);
          //var end = new Date();
          //elapsed = end - start;
          //console.log("Adjusted Text Highlight in: " + elapsed);
          return false;
        }
      }.bind(this));
      
      /*
      // Caching segment heights
      // Incomplete, needs to update on infinite scroll, window resize
      // Not clear there's a great perfomance benefit
      if (!this.state.segmentHeights) {
        this.state.segmentHeights = [];
        $readerPanel.find(".basetext .segment").each(function(i, segment) {
          var $segment = $(segment);
          var top = $segment.offset().top;
          this.state.segmentHeights.push({
              top: top,
              bottom: top + $segment.outerHeight(),
              ref: $segment.attr("data-ref")})
        }.bind(this));
        this.setState(this.state);    
      }

      for (var i = 0; i < this.state.segmentHeights.length; i++) {
        var segment = this.state.segmentHeights[i];
        if (segment.bottom > center) {
          this.showTextList(segment.ref);
          return;
        }
      }
      */

    }.bind(this));
  },
  scrollToHighlighted: function() {
    window.requestAnimationFrame(function() {
      var $container   = $(ReactDOM.findDOMNode(this));
      var $readerPanel = $container.closest(".readerPanel");
      var $highlighted = $container.find(".segment.highlight").first();
      if ($highlighted.length) {
        var height     = $highlighted.outerHeight();
        var viewport   = $container.outerHeight() - $readerPanel.find(".textList").outerHeight();
        var offset     = height > viewport + 30 ? 30 : (viewport - height) / 2;
        this.justScrolled = true;
        $container.scrollTo($highlighted, 0, {offset: -offset});
      }
    }.bind(this));
  },
  render: function() {
    var classes = classNames({textColumn: 1, connectionsOpen: this.props.mode === "TextAndConnections"});
    var content =  this.props.srefs.map(function(ref, k) {
      return (React.createElement(TextRange, {
        sref: ref, 
        highlightedRefs: this.props.highlightedRefs, 
        basetext: true, 
        withContext: true, 
        loadLinks: true, 
        prefetchNextPrev: true, 
        settings: this.props.settings, 
        setOption: this.props.setOption, 
        showBaseText: this.props.showBaseText, 
        onSegmentClick: this.props.onSegmentClick, 
        onCitationClick: this.props.onCitationClick, 
        onTextLoad: this.handleTextLoad, 
        filter: this.props.filter, 
        panelsOpen: this.props.panelsOpen, 
        key: k + ref}));      
    }.bind(this));

    if (content.length) {
      // Add Next and Previous loading indicators
      var first   = sjs.library.ref(this.props.srefs[0]);
      var last    = sjs.library.ref(this.props.srefs.slice(-1)[0]);
      var hasPrev = first && first.prev;
      var hasNext = last && last.next;
      var topSymbol  = " ";
      var bottomSymbol = " "
      if (hasPrev) {
        content.splice(0, 0, (React.createElement(LoadingMessage, {className: "base prev", key: "prev"})));
      } else {
        content.splice(0, 0, (React.createElement(LoadingMessage, {message: topSymbol, heMessage: topSymbol, className: "base prev", key: "prev"})));        
      }
      if (hasNext) {
        content.push((React.createElement(LoadingMessage, {className: "base next", key: "next"})));
      } else {
        content.push((React.createElement(LoadingMessage, {message: bottomSymbol, heMessage: bottomSymbol, className: "base next final", key: "next"})));

      }
    }

    return (React.createElement("div", {className: classes, onMouseUp: this.handleTextSelection}, content));
  }
});


var TextRange = React.createClass({displayName: "TextRange",
  // A Range or text defined a by a single Ref. Specially treated when set as 'basetext'.
  // This component is responsible for retrieving data from sjs.library for the ref that defines it.
  propTypes: {
    sref:                React.PropTypes.string.isRequired,
    highlightedRefs:     React.PropTypes.array,
    basetext:            React.PropTypes.bool,
    withContext:         React.PropTypes.bool,
    hideTitle:           React.PropTypes.bool,
    loadLinks:           React.PropTypes.bool,
    prefetchNextPrev:    React.PropTypes.bool,
    openOnClick:         React.PropTypes.bool,
    lowlight:            React.PropTypes.bool,
    numberLabel:         React.PropTypes.number,
    settings:            React.PropTypes.object,
    filter:              React.PropTypes.array,
    onTextLoad:          React.PropTypes.func,
    onRangeClick:        React.PropTypes.func,
    onSegmentClick:      React.PropTypes.func,
    onCitationClick:     React.PropTypes.func,
    panelsOpen:          React.PropTypes.number
  },
  getInitialState: function() {
    return { 
      segments: [],
      loaded: false,
      linksLoaded: false,
      data: {ref: this.props.sref},
    };
  },
  componentDidMount: function() {
    this.getText();
    if (this.props.basetext || this.props.segmentNumber) { 
      this.placeSegmentNumbers();
    }
    window.addEventListener('resize', this.handleResize);
  },
  componentWillUnmount: function() {
    window.removeEventListener('resize', this.handleResize);
  },
  componentDidUpdate: function(prevProps, prevState) {
    // Place segment numbers again if update affected layout
    if (this.props.basetext || this.props.segmentNumber) { 
      if ((!prevState.loaded && this.state.loaded) ||
          (!prevState.linksLoaded && this.state.linksLoaded) ||
          prevProps.settings.language !== this.props.settings.language ||
          prevProps.settings.layoutDefault !== this.props.settings.layoutDefault ||
          prevProps.settings.layoutTanach !== this.props.settings.layoutTanach ||
          prevProps.settings.layoutTalmud !== this.props.settings.layoutTalmud ||
          prevProps.settings.fontSize !== this.props.settings.fontSize ||
          prevProps.panelsOpen !== this.props.panelsOpen) {
            window.requestAnimationFrame(function() { 
              if (this.isMounted()) {
                this.placeSegmentNumbers();
              }
            }.bind(this));        
      }
    }
    if (this.props.onTextLoad && !prevState.loaded && this.state.loaded) {
      this.props.onTextLoad();
    }
  },
  handleResize: function() {
    if (this.props.basetext || this.props.segmentNumber) { 
      this.placeSegmentNumbers();
    }
  },
  handleClick: function(event) {
    console.log("click")
    if (window.getSelection().type === "Range") { 
      // Don't do anything if this click is part of a selection
      return;
    }
    if (this.props.onRangeClick) {
      //Click on the body of the TextRange itself from TextList
      this.props.onRangeClick(this.props.sref);
      sjs.track.event("Reader", "Click Text from TextList", this.props.sref);
    }
  },
  getText: function() {
    settings = {
      context: this.props.withContext ? 1 : 0
    };
    sjs.library.text(this.props.sref, settings, this.loadText);
  },
  makeSegments: function(data) {
    // Returns a flat list of annotated segment objects,
    // derived from the walking the text in data
    if ("error" in data) { return []; }
    var segments  = [];
    var highlight = data.sections.length === data.textDepth; 
    var wrap = (typeof data.text == "string");
    var en = wrap ? [data.text] : data.text;
    var he = wrap ? [data.he] : data.he;
    var topLength = Math.max(en.length, he.length);
    en = en.pad(topLength, "");
    he = he.pad(topLength, "");

    var start = (data.textDepth == data.sections.length && !this.props.withContext ?
                  data.sections.slice(-1)[0] : 1);

    if (!data.isSpanning) {
      for (var i = 0; i < topLength; i++) {
        var number = i+start;
        var delim  = data.textDepth == 1 ? " " : ":";
        var ref = data.sectionRef + delim + number;
        segments.push({
          ref: ref,
          en: en[i], 
          he: he[i],
          number: number,
          highlight: highlight && number >= data.sections.slice(-1)[0] && number <= data.toSections.slice(-1)[0],
        });
      }      
    } else {
      for (var n = 0; n < topLength; n++) {
        var en2 = typeof en[n] == "string" ? [en[n]] : en[n];
        var he2 = typeof he[n] == "string" ? [he[n]] : he[n];
        var length = Math.max(en2.length, he2.length);
        en2 = en2.pad(length, "");
        he2 = he2.pad(length, "");
        var baseRef     = data.book;
        var baseSection = data.sections.slice(0,-2).join(":");
        var delim       = baseSection ? ":" : " ";
        var baseRef     = baseSection ? baseRef + " " + baseSection : baseRef;

        start = (n == 0 ? start : 1);
        for (var i = 0; i < length; i++) {
          var section = n+data.sections.slice(-2)[0];
          var number  = i+start;
          var ref = baseRef + delim + section + ":" + number;
          segments.push({
            ref: ref,
            en: en2[i], 
            he: he2[i],
            number: number,
            highlight: highlight && 
                        ((n == 0 && number >= data.sections.slice(-1)[0]) || 
                         (n == topLength-1 && number <= data.toSections.slice(-1)[0]) ||
                         (n > 0 && n < topLength -1)),
          });
        }
      }
    }
    return segments;
  },
  loadText: function(data) {
    // When data is actually available, load the text into the UI
    if (this.props.basetext && this.props.sref !== data.ref) {
      // Replace ReaderPanel contents ref with the normalized form of the ref, if they differ.
      // Pass parameter to showBaseText to replaceHistory
      this.props.showBaseText(data.ref, true);        
    }

    var segments  = this.makeSegments(data);
    if (this.isMounted()) {
      this.setState({
        data: data,
        segments: segments,
        loaded: true,
        sref: data.ref
      });      
    }

    // Load links at section level if spanning, so that cache is properly primed with section level refs
    var sectionRefs = data.isSpanning ? data.spanningRefs : [data.sectionRef];
    sectionRefs = sectionRefs.map(function(ref) {
      if (ref.indexOf("-") > -1) {
        ref = ref.split("-")[0];
        ref = ref.slice(0, ref.lastIndexOf(":"));
      }
      return ref;
    });

    if (this.props.loadLinks && !sjs.library.linksLoaded(sectionRefs)) {
      // Calling when links are loaded will overwrite state.segments
      for (var i = 0; i < sectionRefs.length; i++) {
        sjs.library.links(sectionRefs[i], this.loadLinkCounts);
      }
    }

    if (this.props.prefetchNextPrev) {
      if (data.next) { sjs.library.text(data.next, {context: 1}, function() {}); }
      if (data.prev) { sjs.library.text(data.prev, {context: 1}, function() {}); }
      if (data.book) { sjs.library.textTocHtml(data.book, function() {}); }
    }
  },
  loadLinkCounts: function() {
    // When link data has been loaded into sjs.library, load the counts into the UI
    if (this.isMounted()) {
      this.setState({linksLoaded: true});
    }
  },
  placeSegmentNumbers: function() {
    // Set the vertical offsets for segment numbers and link counts, which are dependent
    // on the rendered height of the text of each segment.
    var $text  = $(ReactDOM.findDOMNode(this));
    var setTop = function() {
       var top  = $(this).parent().position().top;
      $(this).css({top: top}).show();   
    }
    $text.find(".segmentNumber").each(setTop);
    $text.find(".linkCount").each(setTop);
  },
  render: function() {
    if (this.props.basetext && this.state.loaded) {
      var ref              = this.props.withContext ? this.state.data.sectionRef : this.state.data.ref;
      var sectionStrings   = sjs.library.sectionString(ref);
      var oref             = sjs.library.ref(ref);
      var useShortString   = oref && $.inArray(oref.categories[0], ["Tanach", "Mishnah", "Talmud", "Tosefta", "Commentary"]) !== -1;
      var title            = useShortString ? sectionStrings.en.numbered : sectionStrings.en.named;
      var heTitle          = useShortString ? sectionStrings.he.numbered : sectionStrings.he.named;   
    } else if (this.props.basetext) {
      var title            = "Loading...";
      var heTitle          = "טעינה...";      
    } else {  
      var title            = this.state.data.ref;
      var heTitle          = this.state.data.heRef;
    }

    var showNumberLabel    = this.state.data.categories &&
                              this.state.data.categories[0] !== "Talmud" &&
                              this.state.data.categories[0] !== "Liturgy";

    var showSegmentNumbers = showNumberLabel && this.props.basetext;
                              

    var textSegments = this.state.segments.map(function (segment, i) {
      var highlight = this.props.highlightedRefs && this.props.highlightedRefs.length ?                                  // if highlighted refs are explicitly set
                        $.inArray(segment.ref, this.props.highlightedRefs) !== -1 : // highlight if this ref is in highlighted refs prop
                        this.props.basetext && segment.highlight;                   // otherwise highlight if this a basetext and the ref is specific
      return (
        React.createElement(TextSegment, {
            sref: segment.ref, 
            en: segment.en, 
            he: segment.he, 
            highlight: highlight, 
            segmentNumber: showSegmentNumbers ? segment.number : 0, 
            showLinkCount: this.props.basetext, 
            filter: this.props.filter, 
            onSegmentClick: this.props.onSegmentClick, 
            onCitationClick: this.props.onCitationClick, 
            key: i + segment.ref})
      );
    }.bind(this));
    textSegments = textSegments.length ? 
                    textSegments : 
                      this.props.basetext ? "" : (React.createElement(LoadingMessage, null));
    var classes = {
                    textRange: 1,
                    basetext: this.props.basetext,
                    loading: !this.state.loaded,
                    lowlight: this.props.lowlight,
                  };
    classes = classNames(classes);
    return (
      React.createElement("div", {className: classes, onClick: this.handleClick}, 
        showNumberLabel && this.props.numberLabel ? 
          (React.createElement("div", {className: "numberLabel"}, " ", React.createElement("span", {className: "numberLabelInner"}, this.props.numberLabel), " "))
          : null, 
        this.props.hideTitle ? "" :
        (React.createElement("div", {className: "title"}, 
          React.createElement("div", {className: "titleBox"}, 
            React.createElement("span", {className: "en"}, title), 
            React.createElement("span", {className: "he"}, heTitle)
          )
        )), 
        React.createElement("div", {className: "text"}, 
          React.createElement("div", {className: "textInner"}, 
             textSegments 
          )
        )
      )
    );
  }
});


var TextSegment = React.createClass({displayName: "TextSegment",
  propTypes: {
    sref:            React.PropTypes.string,
    en:              React.PropTypes.string,
    he:              React.PropTypes.string,
    highlight:       React.PropTypes.bool,
    segmentNumber:   React.PropTypes.number,
    showLinkCount:   React.PropTypes.bool,
    filter:          React.PropTypes.array,
    onCitationClick: React.PropTypes.func,
    onSegmentClick:  React.PropTypes.func
  },
  handleClick: function(event) {
    if ($(event.target).hasClass("refLink")) {
      //Click of citation
      var ref = humanRef($(event.target).attr("data-ref"));
      this.props.onCitationClick(ref);
      event.stopPropagation();
      sjs.track.event("Reader", "Citation Link Click", ref)
    } else if (this.props.onSegmentClick) {
      this.props.onSegmentClick(this.props.sref);
      sjs.track.event("Reader", "Text Segment Click", this.props.sref);
    }
  },
  render: function() {    
    if (this.props.showLinkCount) {
      var linkCount = sjs.library.linkCount(this.props.sref, this.props.filter);
      var minOpacity = 20, maxOpacity = 70;
      var linkScore = linkCount ? Math.min(linkCount+minOpacity, maxOpacity) / 100.0 : 0;
      var style = {opacity: linkScore};
      var linkCount = this.props.showLinkCount ? (React.createElement("div", {className: "linkCount"}, 
                                                    React.createElement("span", {className: "en"}, React.createElement("span", {className: "linkCountDot", style: style})), 
                                                    React.createElement("span", {className: "he"}, React.createElement("span", {className: "linkCountDot", style: style}))
                                                  )) : null;      
    } else {
      var linkCount = "";
    }
    var segmentNumber = this.props.segmentNumber ? (React.createElement("div", {className: "segmentNumber"}, 
                                                      React.createElement("span", {className: "en"}, " ", React.createElement("span", {className: "segmentNumberInner"}, this.props.segmentNumber), " "), 
                                                      React.createElement("span", {className: "he"}, " ", React.createElement("span", {className: "segmentNumberInner"}, encodeHebrewNumeral(this.props.segmentNumber)), " ")
                                                    )) : null;
    var he = this.props.he || this.props.en;
    var en = this.props.en || this.props.he;
    var classes=classNames({ segment: 1,
                     highlight: this.props.highlight,
                     heOnly: !this.props.en,
                     enOnly: !this.props.he });
    return (
      React.createElement("span", {className: classes, onClick: this.handleClick, "data-ref": this.props.sref}, 
        segmentNumber, 
        linkCount, 
        React.createElement("span", {className: "he", dangerouslySetInnerHTML:  {__html: he + " "} }), 
        React.createElement("span", {className: "en", dangerouslySetInnerHTML:  {__html: en + " "} })
      )
    );
  }
});


var TextList = React.createClass({displayName: "TextList",
  propTypes: {
    srefs:                   React.PropTypes.array.isRequired,    // an array of ref strings
    filter:                  React.PropTypes.array.isRequired,
    recentFilters:           React.PropTypes.array.isRequired,
    fullPanel:               React.PropTypes.bool,
    multiPanel:              React.PropTypes.bool,
    setFilter:               React.PropTypes.func,
    onTextClick:             React.PropTypes.func,
    onCitationClick:         React.PropTypes.func,
    openNav:                 React.PropTypes.func,
    openDisplaySettings:     React.PropTypes.func,
    closePanel:              React.PropTypes.func
  },
  getInitialState: function() {
    return {
      linksLoaded: false,
      textLoaded: false,
    }
  },
  componentDidMount: function() {
    this.loadConnections();
    this.scrollToHighlighted();
  },
  componentWillReceiveProps: function(nextProps) {
    this.preloadText(nextProps.filter);
  },
  componetWillUpdate: function(nextProps) {

  },
  componentDidUpdate: function(prevProps, prevState) {
    if (prevProps.filter.length && !this.props.filter.length) {
      this.scrollToHighlighted();
    }
    if (!prevProps.filter.compare(this.props.filter)) {
      this.scrollToHighlighted();
    } else if (!prevState.textLoaded && this.state.textLoaded) {
      this.scrollToHighlighted();
    } else if (!prevProps.srefs.compare(this.props.srefs)) {
      this.loadConnections();
      this.scrollToHighlighted();
    }
  },
  getSectionRef: function() {
    var ref = this.props.srefs[0]; // TODO account for selections spanning sections
    var sectionRef = sjs.library.sectionRef(ref) || ref;
    return sectionRef;
  },
  loadConnections: function() {
    // Load connections data from server for this section
    var sectionRef = this.getSectionRef();
    if (!sectionRef) { return; }
    sjs.library.links(sectionRef, function(links) {
      if (this.isMounted()) {
        this.preloadText(this.props.filter);
        this.setState({
          linksLoaded: true,
        });
      }
    }.bind(this));
  },
  preloadText: function(filter) {
    // Preload text of links if `filter` is a single commentary, or all commentary
    if (filter.length == 1 && 
        sjs.library.index(filter[0]) && 
        sjs.library.index(filter[0]).categories == "Commentary") {
      this.preloadSingleCommentaryText(filter);
    } else if (filter.length == 1 && filter[0] == "Commentary") {
      this.preloadAllCommentaryText(filter);
    } else {
      this.setState({waitForText: false, textLoaded: false});
    }
  },
  preloadSingleCommentaryText: function(filter) {
    var basetext   = this.getSectionRef();
    var commentary = filter[0] + " on " + basetext;
    this.setState({textLoaded: false, waitForText: true});
    sjs.library.text(commentary, {}, function() {
      if (this.isMounted()) {
        this.setState({textLoaded: true});        
      }
    }.bind(this));
  },
  preloadAllCommentaryText: function() {
    var basetext   = this.getSectionRef();
    var summary    = sjs.library.linkSummary(basetext);
    if (summary.length && summary[0].category == "Commentary") {
      this.setState({textLoaded: false, waitForText: true});
      // Get a list of commentators on this section that we need don't have in the cache
      var links = sjs.library.links(basetext);
      var commentators = summary[0].books.map(function(item) {
        return item.book;
      }).filter(function(commentator) {
        var link = sjs.library._filterLinks(links, [commentator])[0];
        if (link.sourceRef.indexOf(link.anchorRef) == -1) {
          // Check if this is Commentary2, exclude if so
          return false;
        }
        // Exclude if we already have this in the cache
        return !sjs.library.text(commentator + " on " + basetext);
      });
      if (commentators.length) {
        this.waitingFor = commentators;
        for (var i = 0; i < commentators.length; i++) {
          sjs.library.text(commentators[i] + " on " + basetext, {}, function(data) {
            var index = this.waitingFor.indexOf(data.commentator);
            if (index > -1) {
                this.waitingFor.splice(index, 1);
            }
            if (this.waitingFor.length == 0) {
              if (this.isMounted()) {
                this.setState({textLoaded: true});
              }
            }
          }.bind(this));          
        }          
      } else {
        // All commentaries have been loaded already
        this.setState({textLoaded: true});          
      }
    } else {
      // There were no commentaries to load
      this.setState({textLoaded: true});
    }
  },
  scrollToHighlighted: function() {
    window.requestAnimationFrame(function() {
      if (!this.isMounted()) { return; }
      var $highlighted = $(ReactDOM.findDOMNode(this)).find(".texts .textRange").not(".lowlight").first();
      if ($highlighted.length) {
        var $texts = $(ReactDOM.findDOMNode(this)).find(".texts")
        var adjust = parseInt($texts.css("padding-top")) + 18;
        $texts.scrollTo($highlighted, 0, {offset: -adjust});
      }
    }.bind(this));
  },
  showAllFilters: function() {
    this.props.setFilter(null);
    sjs.track.event("Reader", "Show All Filters Click", "1");
  },
  render: function() {
    var refs               = this.props.srefs;
    var summary            = sjs.library.linkSummary(refs);
    var filter             = this.props.filter;
    var sectionRef         = this.getSectionRef();
    var sectionLinks       = sjs.library.links(sectionRef);
    var isSingleCommentary = (filter.length == 1 && sjs.library.index(filter[0]) && sjs.library.index(filter[0]).categories == "Commentary");

    var links = sectionLinks.filter(function(link) {
      if (!isSingleCommentary && $.inArray(link.anchorRef, refs) === -1) {
        // Only show section level links for an individual commentary
        return false;
      }
      return (filter.length == 0 ||
              $.inArray(link.category, filter) !== -1 || 
              $.inArray(link.commentator, filter) !== -1 );

      }.bind(this)).sort(function(a, b) {
        if (a.anchorVerse !== b.anchorVerse) {
            return a.anchorVerse - b.anchorVerse;
        } else if ( a.commentaryNum !== b.commentaryNum) {
            return a.commentaryNum - b.commentaryNum;
        } else {
            return a.sourceRef > b.sourceRef ? 1 : -1;
        }
    });

    //if (summary.length && !links.length) { debugger; }

    var en = "No connections known" + (filter.length ? " for " + filter.join(", ") : "") + ".";;
    var he = "אין קשרים ידועים"       + (filter.length ? " ל"    + filter.join(", ") : "") + ".";;
    var loaded  = sjs.library.linksLoaded(sectionRef);
    var message = !loaded ? 
                    (React.createElement(LoadingMessage, null)) : 
                      (summary.length === 0 ? 
                        React.createElement(LoadingMessage, {message: en, heMessage: he}) : null);
    
    var showAllFilters = !filter.length;
    if (!showAllFilters) {
      var texts = links.length == 0 ? message :
                    this.state.waitForText && !this.state.textLoaded ? 
                      (React.createElement(LoadingMessage, null)) : 
                      links.map(function(link, i) {
                          var hideTitle = link.category === "Commentary" && this.props.filter[0] !== "Commentary";
                          return (React.createElement(TextRange, {
                                    sref: link.sourceRef, 
                                    key: i + link.sourceRef, 
                                    lowlight: $.inArray(link.anchorRef, refs) === -1, 
                                    hideTitle: hideTitle, 
                                    numberLabel: link.category === "Commentary" ? link.anchorVerse : 0, 
                                    basetext: false, 
                                    onRangeClick: this.props.onTextClick, 
                                    onCitationClick: this.props.onCitationClick}));
                        }, this);      
    }

    var classes = classNames({textList: 1, fullPanel: this.props.fullPanel});
    if (showAllFilters) {
      return (
        React.createElement("div", {className: classes}, 
          React.createElement("div", {className: "textListTop"}, 
              message
          ), 
          React.createElement(AllFilterSet, {
            summary: summary, 
            showText: this.props.showText, 
            filter: this.props.fitler, 
            recentFilters: this.props.recentFilters, 
            setFilter: this.props.setFilter})
        ));
    } else {
      return (
        React.createElement("div", {className: classes}, 
          React.createElement("div", {className: "textListTop"}, 
            this.props.fullPanel ? 
              (React.createElement("div", {className: "leftButtons"}, 
                this.props.closePanel ? (React.createElement(ReaderNavigationMenuCloseButton, {icon: "arrow", onClick: this.props.closePanel})) : null, 
                React.createElement(ReaderNavigationMenuSearchButton, {onClick: this.props.openNav})
               )) : null, 
            React.createElement(RecentFilterSet, {
              showText: this.props.showText, 
              filter: this.props.filter, 
              recentFilters: this.props.recentFilters, 
              setFilter: this.props.setFilter, 
              showAllFilters: this.showAllFilters}), 
            this.props.fullPanel ? 
              (React.createElement("div", {className: "rightButtons"}, 
                React.createElement(ReaderNavigationMenuDisplaySettingsButton, {onClick: this.props.openDisplaySettings})
               )) : null
          ), 
          React.createElement("div", {className: "texts"}, 
            React.createElement("div", {className: "contentInner"}, 
               texts 
            )
          )
        ));
    }
  }
});


var AllFilterSet = React.createClass({displayName: "AllFilterSet",
  render: function() {
    var categories = this.props.summary.map(function(cat, i) {
      return (
        React.createElement(CategoryFilter, {
          key: i, 
          category: cat.category, 
          heCategory: sjs.library.hebrewCategory(cat.category), 
          count: cat.count, 
          books: cat.books, 
          filter: this.props.filter, 
          updateRecent: true, 
          setFilter: this.props.setFilter, 
          on: $.inArray(cat.category, this.props.filter) !== -1})
      );
    }.bind(this));
    return (
      React.createElement("div", {className: "fullFilterView filterSet"}, 
        categories
      )
    );
  }
});


var CategoryFilter = React.createClass({displayName: "CategoryFilter",
  handleClick: function() {
    this.props.setFilter(this.props.category, this.props.updateRecent);
    sjs.track.event("Reader", "Category Filter Click", this.props.category);
  },
  render: function() {
    var textFilters = this.props.books.map(function(book, i) {
     return (React.createElement(TextFilter, {
                key: i, 
                book: book.book, 
                heBook: book.heBook, 
                count: book.count, 
                category: this.props.category, 
                hideColors: true, 
                updateRecent: true, 
                setFilter: this.props.setFilter, 
                on: $.inArray(book.book, this.props.filter) !== -1}));
    }.bind(this));
    
    var color   = sjs.categoryColor(this.props.category);
    var style   = {"borderTop": "4px solid " + color};
    var classes = classNames({categoryFilter: 1, on: this.props.on});
    var count   = (React.createElement("span", {className: "enInHe"}, this.props.count));
    return (
      React.createElement("div", {className: "categoryFilterGroup", style: style}, 
        React.createElement("div", {className: classes, onClick: this.handleClick}, 
          React.createElement("span", {className: "en"}, this.props.category, " | ", count), 
          React.createElement("span", {className: "he"}, this.props.heCategory, " | ", count)
        ), 
        React.createElement(TwoBox, {content:  textFilters })
      )
    );
  }
});


var TextFilter = React.createClass({displayName: "TextFilter",
  propTypes: {
    book:         React.PropTypes.string.isRequired,
    heBook:       React.PropTypes.string.isRequired,
    on:           React.PropTypes.bool.isRequired,
    setFilter:    React.PropTypes.func.isRequired,
    updateRecent: React.PropTypes.bool,
  },
  handleClick: function() {
    this.props.setFilter(this.props.book, this.props.updateRecent);
    sjs.track.event("Reader", "Text Filter Click", this.props.book);
  },
  render: function() {
    var classes = classNames({textFilter: 1, on: this.props.on, lowlight: this.props.count == 0});

    if (!this.props.hideColors) {
      var color = sjs.categoryColor(this.props.category)
      var style = {"borderTop": "4px solid " + color};
    }
    var name = this.props.book == this.props.category ? this.props.book.toUpperCase() : this.props.book;
    var count = this.props.hideCounts || !this.props.count ? "" : ( React.createElement("span", {className: "enInHe"}, " (", this.props.count, ")"));
    return (
      React.createElement("div", {
        className: classes, 
        style: style, 
        onClick: this.handleClick}, 
          React.createElement("div", null, 
            React.createElement("span", {className: "en"}, name, count), 
            React.createElement("span", {className: "he"}, this.props.heBook, count)
          )
      )
    );
  }
});


var RecentFilterSet = React.createClass({displayName: "RecentFilterSet",
  propTypes: {
    filter:         React.PropTypes.array.isRequired,
    recentFilters:  React.PropTypes.array.isRequired,
    setFilter:      React.PropTypes.func.isRequired,
    showAllFilters: React.PropTypes.func.isRequired
  },
  toggleAllFilterView: function() {
    this.setState({showAllFilters: !this.state.showAllFilters});
  },
  render: function() {
    var topLinks = []; // sjs.library.topLinks(this.props.sref);

    // Filter top links to exclude items already in recent filter
    topLinks = topLinks.filter(function(link) {
      return ($.inArray(link.book, this.props.recentFilters) == -1);
    }.bind(this));
    
    // Annotate filter texts with category            
    var recentFilters = this.props.recentFilters.map(function(filter) {
      var index = sjs.library.index(filter);
      return {
          book: filter,
          heBook: index ? index.heTitle : sjs.library.hebrewCategory(filter),
          category: index ? index.categories[0] : filter };
    });
    topLinks = recentFilters.concat(topLinks).slice(0,5);

    // If the current filter is not already in the top set, put it first 
    if (this.props.filter.length) {
      var filter = this.props.filter[0];
      for (var i=0; i < topLinks.length; i++) {
        if (topLinks[i].book == filter || 
            topLinks[i].category == filter ) { break; }
      }
      if (i == topLinks.length) {
        var index = sjs.library.index(filter);
        if (index) {
          var annotatedFilter = {book: filter, heBook: index.heTitle, category: index.categories[0] };
        } else {
          var annotatedFilter = {book: filter, heBook: filter, category: "Other" };
        }

        topLinks = [annotatedFilter].concat(topLinks).slice(0,5);
      } else {
        // topLinks.move(i, 0); 
      }        
    }
    var category = topLinks[0].category;
    var topFilters = topLinks.map(function(book) {
     return (React.createElement(TextFilter, {
                key: book.book, 
                book: book.book, 
                heBook: book.heBook, 
                category: book.category, 
                hideCounts: true, 
                hideColors: true, 
                count: book.count, 
                updateRecent: false, 
                setFilter: this.props.setFilter, 
                on: $.inArray(book.book, this.props.filter) !== -1, 
                onClick: function(){ sjs.track.event("Reader", "Top Filter Click", "1");}}));
    }.bind(this));

    var moreButton = (React.createElement("div", {className: "showMoreFilters textFilter", style: style, 
                        onClick: this.props.showAllFilters}, 
                          React.createElement("div", null, 
                            React.createElement("span", {className: "dot"}, "●"), React.createElement("span", {className: "dot"}, "●"), React.createElement("span", {className: "dot"}, "●")
                          )
                    ));

    var style = {"borderTopColor": sjs.categoryColor(category)};
    return (
      React.createElement("div", {className: "topFilters filterSet", style: style}, 
        React.createElement("div", {className: "topFiltersInner"}, topFilters), 
        moreButton
      )
    );
  }
});


var SearchPage = React.createClass({displayName: "SearchPage",
    propTypes: {
        initialSettings : React.PropTypes.shape({
            query: React.PropTypes.string,
            page: React.PropTypes.number
        }),
        settings:      React.PropTypes.object,
        close:         React.PropTypes.func,
        onResultClick: React.PropTypes.func,
        onQueryChange: React.PropTypes.func
    },
    getInitialState: function() {
        return {
            query: this.props.initialSettings.query,
            page: this.props.initialSettings.page || 1,
            runningQuery: null,
            isQueryRunning: false
        }
    },
    updateQuery: function(query) {
        this.setState({query: query});
        if (this.props.onQueryChange) {
            this.props.onQueryChange(query);
        }
    },
    updateRunningQuery: function(ajax) {
        this.setState({
            runningQuery: ajax,
            isQueryRunning: !!ajax
        })
    },
    render: function () {
        var style      = {"fontSize": this.props.settings.fontSize + "%"};
        return (React.createElement("div", {className: "readerNavMenu"}, 
                React.createElement("div", {className: "readerNavTop search"}, 
                  React.createElement(CategoryColorLine, {category: "Other"}), 
                  React.createElement(ReaderNavigationMenuCloseButton, {onClick: this.props.close}), 
                  React.createElement(ReaderNavigationMenuDisplaySettingsButton, {onClick: this.props.openDisplaySettings}), 
                  React.createElement(SearchBar, {
                    initialQuery:  this.state.query, 
                    updateQuery:  this.updateQuery})
                ), 
                  React.createElement("div", {className: "content"}, 
                    React.createElement("div", {className: "contentInner"}, 
                      React.createElement("div", {className: "searchContentFrame"}, 
                          React.createElement("div", {className: "searchControlsBox"}
                          ), 
                          React.createElement("div", {className: "searchContent", style: style}, 
                              React.createElement(SearchResultList, {
                                  query:  this.state.query, 
                                  page:  this.state.page, 
                                  updateRunningQuery:  this.updateRunningQuery, 
                                  onResultClick: this.props.onResultClick})
                          )
                      )
                    )
                  )
                ));
    }
});

/*
    $(".searchInput").autocomplete({ source: function( request, response ) {
        var matches = $.map( sjs.books, function(tag) {
            if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
              return tag;
            }
          });
        response(matches.slice(0, 30)); // limits return to 30 items
      }
    }).focus(function() {
      //$(this).css({"width": "300px"});
      $(this).closest(".searchBox").find(".keyboardInputInitiator").css({"opacity": 1});
    }).blur(function() {
      $(this).closest(".searchBox").find(".keyboardInputInitiator").css({"opacity": 0});
    });
    $(".searchButton").mousedown(sjs.handleSearch);
 */
var SearchBar = React.createClass({displayName: "SearchBar",
    propTypes: {
        initialQuery: React.PropTypes.string,
        updateQuery: React.PropTypes.func
    },
    getInitialState: function() {
        return {query: this.props.initialQuery};
    },
    handleKeypress: function(event) {
        if (event.charCode == 13) {
            this.updateQuery();
            // Blur search input to close keyboard
            $(ReactDOM.findDOMNode(this)).find(".readerSearch").blur();
        }
    },
    updateQuery: function() {
        if (this.props.updateQuery) {
            this.props.updateQuery(this.state.query)
        }
    },
    handleChange: function(event) {
        this.setState({query: event.target.value});
    },
    render: function () {
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "searchBox"}, 
                    React.createElement("input", {className: "readerSearch", value: this.state.query, onKeyPress: this.handleKeypress, onChange: this.handleChange, placeholder: "Search"}), 
                    React.createElement(ReaderNavigationMenuSearchButton, {onClick: this.updateQuery})
                ), 
                React.createElement("div", {className: "description"})
            )
        )
    }
});


var SearchResultList = React.createClass({displayName: "SearchResultList",
    propTypes: {
        query: React.PropTypes.string,
        page: React.PropTypes.number,
        size: React.PropTypes.number,
        updateRunningQuery: React.PropTypes.func,
        onResultClick: React.PropTypes.func
    },
    getDefaultProps: function() {
        return {
            page: 1,
            size: 100
        };
    },
    getInitialState: function() {
        return {
            runningQuery: null,
            total: 0,
            text_total: 0,
            sheet_total: 0,
            text_hits: [],
            sheet_hits: [],
            aggregations: null
        }
    },
    updateRunningQuery: function(ajax) {
        this.setState({runningQuery: ajax});
        this.props.updateRunningQuery(ajax);
    },
    _abortRunningQuery: function() {
        if(this.state.runningQuery) {
            this.state.runningQuery.abort();
        }
    },
    _executeQuery: function(props) {
        //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
        props = props || this.props;

        if (!props.query) {
            return;
        }

        this._abortRunningQuery();

        var runningQuery = sjs.library.search.execute_query({
            query: props.query,
            size: props.page * props.size,
            success: function(data) {
                if (this.isMounted()) {
                    var hitarrays = this._process_hits(data.hits.hits);
                    this.setState({
                        text_hits: hitarrays.texts,
                        sheet_hits: hitarrays.sheets,
                        total: data.hits.total,
                        text_total: hitarrays.texts.length,
                        sheet_total: hitarrays.sheets.length,
                        aggregations: data.aggregations
                    });
                    this.updateRunningQuery(null);
                }
            }.bind(this),
            error: function(jqXHR, textStatus, errorThrown) {
                if (textStatus == "abort") {
                    // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
                    //this.updateCurrentQuery(null);
                    return;
                }
                if (this.isMounted()) {
                    this.setState({
                        error: true
                    });
                    this.updateRunningQuery(null);
                }
            }.bind(this)
        });
        this.updateRunningQuery(runningQuery);
    },
    _process_hits: function(hits) {
        var comparingRef = null;
        var newHits = [];
        var sheetHits = [];

        for(var i = 0, j = 0; i < hits.length; i++) {
            if (hits[i]._type == "sheet") { //Assume that the rest of the array is sheets, slice and return.
                sheetHits = hits.slice(i);
                break;
            }

            var currentRef = hits[i]._source.ref;
            if(currentRef == comparingRef) {
                newHits[j - 1].duplicates = newHits[j-1].duplicates || [];
                newHits[j - 1].duplicates.push(hits[i]);
            } else {
                newHits[j] = hits[i];
                j++;
                comparingRef = currentRef;
            }
        }
        return {
            texts: newHits,
            sheets: sheetHits
        };
    },
    componentDidMount: function() {
        this._executeQuery();
    },
    componentWillUnmount: function() {
        this._abortRunningQuery();
    },
    componentWillReceiveProps: function(newProps) {
        if(this.props.query != newProps.query) {
           this.setState({
                total: 0,
                text_total: 0,
                sheet_total: 0,
                text_hits: [],
                sheet_hits: [],
                aggregations: null
           });
           this._executeQuery(newProps)
        }
        else if (
            this.props.size != newProps.size
            || this.props.page != newProps.page
        ) {
           this._executeQuery(newProps)
        }
    },
    render: function () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }
        if (this.state.runningQuery) {
            return (React.createElement(LoadingMessage, null))
        }
        var addCommas = function(number) { return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
        var totalWithCommas = addCommas(this.state.total);
        var totalSheetsWithCommas = addCommas(this.state.sheet_total);
        var totalTextsWithCommas = addCommas(this.state.text_total);

        var totalBreakdown = React.createElement("span", {className: "results-breakdown"}, " ", 
            React.createElement("span", {className: "he"}, "(", totalTextsWithCommas, " ", (this.state.text_total > 1) ? "מקורות":"מקור", ", ", totalSheetsWithCommas, " ", (this.state.sheet_total > 1)?"דפי מקורות":"דף מקורות", ")"), 
            React.createElement("span", {className: "en"}, "(", totalTextsWithCommas, " ", (this.state.text_total > 1) ? "Texts":"Text", ", ", totalSheetsWithCommas, " ", (this.state.sheet_total > 1)?"Sheets":"Sheet", ")")
        );

        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "results-count"}, 
                    React.createElement("span", {className: "en"}, totalWithCommas, " Results"), 
                    React.createElement("span", {className: "he"}, totalWithCommas, " תוצאות"), 
                    (this.state.sheet_total > 0 && this.state.text_total > 0) ? totalBreakdown : null
                ), 
                this.state.text_hits.map(function(result) {
                    return React.createElement(SearchTextResult, {
                        data: result, 
                        query: this.props.query, 
                        key: result.ref, 
                        onResultClick: this.props.onResultClick}
                        );
                }.bind(this)), 
                this.state.sheet_hits.map(function(result) {
                    return React.createElement(SearchSheetResult, {
                        data: result, 
                        query: this.props.query, 
                        key: result._id}
                        );
                }.bind(this))
            )

        )
    }
});


var SearchTextResult = React.createClass({displayName: "SearchTextResult",
    propTypes: {
        query: React.PropTypes.string,
        data: React.PropTypes.object,
        key: React.PropTypes.string,
        onResultClick: React.PropTypes.func
    },
    getInitialState: function() {
        return {
            duplicatesShown: false
        }
    },
    toggleDuplicates: function(event) {
        this.setState({
            duplicatesShown: !this.state.duplicatesShown
        });
    },
    handleResultClick: function(event) {
        if(this.props.onResultClick) {
            event.preventDefault();
            this.props.onResultClick(this.props.data._source.ref);
        }
    },
    render: function () {
        var data = this.props.data;
        var s = this.props.data._source;
        var href = '/' + normRef(s.ref) + "/" + s.lang + "/" + s.version.replace(/ +/g, "_") + '?qh=' + this.props.query;

        function get_snippet_markup() {
            var snippet;
            if (data.highlight && data.highlight["content"]) {
                snippet = data.highlight["content"].join("...");
            } else {
                snippet = s["content"];
            }
            snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").html();
            return {__html:snippet}
        }

        var more_results_caret =
            (this.state.duplicatesShown)
            ? React.createElement("i", {className: "fa fa-caret-down fa-angle-down"})
            : React.createElement("i", {className: "fa fa-caret-down"});

        var more_results_indicator = (!(data.duplicates)) ? "" :
                React.createElement("div", {className: "similar-trigger-box", onClick: this.toggleDuplicates}, 
                    React.createElement("span", {className: "similar-title he"}, 
                         data.duplicates.length, " ", (data.duplicates.length > 1) ? " גרסאות נוספות" : " גרסה נוספת"
                    ), 
                    React.createElement("span", {className: "similar-title en"}, 
                         data.duplicates.length, " more version", (data.duplicates.length > 1) ? "s" : null
                    ), 
                    more_results_caret
                );

        var shown_duplicates = (data.duplicates && this.state.duplicatesShown) ?
            (React.createElement("div", {className: "similar-results"}, 
                    data.duplicates.map(function(result) {
                        var key = result._source.ref + "-" + result._source.version;
                        return React.createElement(SearchTextResult, {
                            data: result, 
                            key: key, 
                            query: this.props.query, 
                            onResultClick: this.props.onResultClick}
                            );
                        }.bind(this))
            )) : null;

        return (
            React.createElement("div", {className: "result"}, 
                React.createElement("a", {href: href, onClick: this.handleResultClick}, 
                    React.createElement("div", {className: "result-title"}, 
                        React.createElement("span", {className: "en"}, s.ref), 
                        React.createElement("span", {className: "he"}, s.heRef)
                    ), 
                    React.createElement("div", {className: "snippet", dangerouslySetInnerHTML: get_snippet_markup()}), 
                    React.createElement("div", {className: "version"}, s.version)
                ), 
                more_results_indicator, 
                shown_duplicates
            )
        )
    }
});


var SearchSheetResult = React.createClass({displayName: "SearchSheetResult",
    propTypes: {
        query: React.PropTypes.string,
        data: React.PropTypes.object,
        key: React.PropTypes.string
    },
    render: function() {
        var data = this.props.data;
        var s = this.props.data._source;

        var snippet = data.highlight ? data.highlight.content.join("...") : s.content;
        snippet = $("<div>" + snippet.replace(/^[ .,;:!-)\]]+/, "") + "</div>").text();

        function get_version_markup() {
            return {__html: s.version};
        }
        var clean_title = $("<span>" + s.title + "</span>").text();
        var href = "/sheets/" + s.sheetId;
        return (React.createElement("div", {className: "result"}, 
            React.createElement("a", {className: "result-title", href: href}, clean_title), 
            React.createElement("div", {className: "snippet"}, snippet), 
            React.createElement("div", {className: "version", dangerouslySetInnerHTML: get_version_markup()})
            ));
    }
});


var ThreeBox = React.createClass({displayName: "ThreeBox",
  // Wrap a list of elements into a three column table
  render: function() {
      var content = this.props.content;
      var length = content.length;
      if (length % 3) {
          length += (3-length%3);
      }
      content.pad(length, "");
      var threes = [];
      for (var i=0; i<length; i+=3) {
        threes.push([content[i], content[i+1], content[i+2]]);
      }
      return (
        React.createElement("table", {className: "gridBox threeBox"}, 
          React.createElement("tbody", null, 
           
            threes.map(function(row, i) {
              return (
                React.createElement("tr", {key: i}, 
                  React.createElement("td", {className: row[0] ? "" : "empty"}, row[0]), 
                  React.createElement("td", {className: row[1] ? "" : "empty"}, row[1]), 
                  React.createElement("td", {className: row[2] ? "" : "empty"}, row[2])
                )
              );
            })
          
          )
        )
      );
  }
});


var TwoBox = React.createClass({displayName: "TwoBox",
  // Wrap a list of elements into a three column table
  propTypes: {
    content: React.PropTypes.array.isRequired
  },
  render: function() {
      var content = this.props.content;
      var length = content.length;
      if (length % 2) {
          length += (2-length%2);
      }
      content.pad(length, "");
      var threes = [];
      for (var i=0; i<length; i+=2) {
        threes.push([content[i], content[i+1]]);
      }
      return (
        React.createElement("table", {className: "gridBox twoBox"}, 
          React.createElement("tbody", null, 
           
            threes.map(function(row, i) {
              return (
                React.createElement("tr", {key: i}, 
                  React.createElement("td", {className: row[0] ? "" : "empty"}, row[0]), 
                  React.createElement("td", {className: row[1] ? "" : "empty"}, row[1])
                )
              );
            })
          
          )
        )
      );
  }
});


var TwoOrThreeBox = React.createClass({displayName: "TwoOrThreeBox",
  // Wrap a list of elements into a two or three column table, depen
  render: function() {

      if ($(window).width() > 1000) {
        return (React.createElement(ThreeBox, {content: this.props.content}));
      } else {
        return (React.createElement(TwoBox, {content: this.props.content}));
      }
  }
});


var LoadingMessage = React.createClass({displayName: "LoadingMessage",
  propTypes: {
    message:   React.PropTypes.string,
    heMessage: React.PropTypes.string,
    className: React.PropTypes.string
  },
  render: function() {
    var message = this.props.message || "Loading...";
    var heMessage = this.props.heMessage || "טעינה...";
    var classes = "loadingMessage " + (this.props.className || "");
    return (React.createElement("div", {className: classes}, 
              React.createElement("span", {className: "en"}, message), 
              React.createElement("span", {className: "he"}, heMessage)
            ));
  }
});
