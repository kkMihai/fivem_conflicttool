import React from 'react'
import ReactDOM from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import App from './app'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <IconContext.Provider value={{ weight: 'bold' }}>
            <App />
        </IconContext.Provider>
    </React.StrictMode>
)
