import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="empty-contexts" role="alert">
      <h2>This view couldn’t load</h2>
      <p>Your saved work is still on the server. Try this view again, or return to your overview.</p>
      <div className="resume-actions">
        <button type="button" onClick={() => this.setState({ failed: false })}>Try again</button>
        <button type="button" onClick={() => this.props.onHome ? this.props.onHome() : window.location.assign('/')}>Go to overview</button>
      </div>
    </section>;
  }
}
