var React = require('react');
var ReactDOM = require('react-dom');
var Codemirror = require('./Codemirror');

  require('codemirror/mode/javascript/javascript');
  require('codemirror/mode/xml/xml');
  require('codemirror/mode/markdown/markdown');

var defaults = {
  markdown: '# Heading\n\nSome **bold** and _italic_ text\nBy [Jed Watson](https://github.com/JedWatson)',
  javascript: 'var component = {\n\tname: "react-codemirror",\n\tauthor: "Jed Watson",\n\trepo: "https://github.com/JedWatson/react-codemirror"\n};'
};

var App = React.createClass({
  getInitialState () {
    return {
      code: defaults.markdown,
      readOnly: false,
      mode: 'markdown',
    };
  },
  updateCode (newCode) {
    this.setState({
      code: newCode
    });
  },
  changeMode (e) {
    var mode = e.target.value;
    this.setState({
      mode: mode,
      code: defaults[mode]
    });
  },
  toggleReadOnly () {
    this.setState({
      readOnly: !this.state.readOnly
    }, () => this.refs.editor.focus());
  },
  render () {
    var options = {
      lineNumbers: true,
      readOnly: this.state.readOnly,
      mode: this.state.mode
    };
    return (
      <div>
        <div className="container">
          <div style={{ marginTop: 10, marginBottom: 10 }}>
            <select onChange={this.changeMode} value={this.state.mode}>
              <option value="javascript">JavaScript</option>
              <option value="markdown">Markdown</option>
            </select>
            <button onClick={this.toggleReadOnly}>Toggle read-only mode (currently {this.state.readOnly ? 'on' : 'off'})</button>
          </div>
          <div className="col-md-12">
            <Codemirror  className="col-md-8" ref="editor" value={this.state.code} onChange={this.updateCode} options={options} />
          </div>  
          <div>
            <iframe className="col-md-4" src="" />
          </div>
        </div>
        
      </div>
    );
  }
});

ReactDOM.render(<App />, document.getElementById('my-app'));
