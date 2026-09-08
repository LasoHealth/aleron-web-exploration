import { Component } from 'react'
import { createRoot } from 'react-dom/client'
import Callback from './Callback.jsx'
import NoteLifecycle from './NoteLifecycle.jsx'
import OrderLifecycle from './OrderLifecycle.jsx'
import PatientTest from './PatientTest.jsx'
import PhysicianLogin from './PhysicianLogin.jsx'

function Landing() {
  return (
    <>
      <h1>Canvas EMR access tests</h1>
      <p className="muted">
        The physician route is a real staff login (authorization_code, <code>user/*.read</code>).
        The patient route mints a patient-scoped token server-side
        (client_credentials + <code>patient=&lt;id&gt;</code>) — Canvas has no patient-facing
        authorize endpoint to redirect to.
      </p>
      <p>
        <a className="btn" href="/patient">Patient scoping test</a>
        <a className="btn" href="/physician">Physician app</a>
        <a className="btn" href="/notes">Note lifecycle</a>
        <a className="btn" href="/orders">Order lifecycle</a>
      </p>
    </>
  )
}

// Five routes, so a router dependency would be all cost and no benefit.
function App() {
  switch (location.pathname) {
    case '/callback': return <Callback />
    case '/patient': return <PatientTest />
    case '/physician': return <PhysicianLogin />
    case '/notes': return <NoteLifecycle />
    case '/orders': return <OrderLifecycle />
    default: return <Landing />
  }
}

// Without this, any throw in a route unmounts the tree and leaves a blank page
// with the reason only in the console — which is a poor trade in an app whose
// whole job is showing what happened.
class Boundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <>
        <h1>This page threw</h1>
        <p className="muted">
          The error is below rather than in the console, so a blank page is never the whole story.
        </p>
        <pre>{this.state.error.stack ?? String(this.state.error)}</pre>
        <p><a className="btn" href="/">← back</a></p>
      </>
    )
  }
}

// No StrictMode: it double-invokes effects, and /callback exchanges a
// single-use authorization code. Callback also guards this with a ref.
createRoot(document.querySelector('#app')).render(<Boundary><App /></Boundary>)
