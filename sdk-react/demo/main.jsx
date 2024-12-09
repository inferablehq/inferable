import React from 'react'
import ReactDOM from 'react-dom/client'
import { TestPage } from './TestPage'

ReactDOM.createRoot(document.getElementById('root')).render(
  <TestPage
    baseUrl='http://localhost:4000'
    initialPrompt='What tools do we have?'
    clusterId=''
    configId=''
    apiSecret=''/>
)
