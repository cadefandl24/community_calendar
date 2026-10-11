import ReactDOM from 'react-dom/client';
import App from './App';
// import { Auth0Provider } from '@auth0/auth0-react';
 
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);

// Restore this wrapper when Auth0 is configured and login is needed.
// root.render(
//   <Auth0Provider
//     domain=''
//     clientId=''
//     authorizationParams={{ redirect_uri: window.location.origin }}>
//     <App />
//   </Auth0Provider>
// );
