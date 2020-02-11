/**
 * Implement Gatsby's Browser APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/browser-apis/
 */

// You can delete this file if you're not using it
import "./src/styles/site.css"

import React from "react"
import { ContextProviderComponent } from "./src/context/mainContext"
import Layout from './src/layouts/baseLayout'

export const wrapPageElement = ({ element, props }) => {
  // props provide same data to Layout as Page element will get
  // including location, data, etc - you don't need to pass it
  return (
    <ContextProviderComponent>
      <Layout {...props}>{element}</Layout>
    </ContextProviderComponent>
  )
}