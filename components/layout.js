import Link from 'next/link'
import Image from 'next/image'
import { SiteContext, ContextProviderComponent } from '../context/mainContext'
import { slugify } from '../utils/helpers'


export default function Layout({ children, categories }) {
  return (
    <ContextProviderComponent>
      <SiteContext.Consumer>
        {
          context => {
            return (
              <div className="min-h-screen">
                <nav>
                  <div className="flex justify-center">
                    <div className="
                    w-fw
                    mobile:px-12
                    desktop:px-0
                    px-4 pt-12
                    pb-6 flex flex-col sm:flex-row">
                      <div>
                        <div className="mb-4 sm:mr-16">
                          <Image src="/logo.png" alt="logo" width="90" height="28" />
                        </div>
                      </div>
                      <div className="flex flex-wrap mt-1">
                        <Link href="/" className="mb-4 w-24 mw-24 sm:w-20 sm:mr-16">
                          <a>
                            <p className="text-left m-0 text-smaller mr-4 sm:mr-8">
                            Home
                            </p>
                          </a>
                        </Link>
                        {
                          categories.map((category, index) => (
                            <Link href={`/category/${slugify(category)}`} key={index} className="mb-4 w-24 mw-24 sm:w-20 sm:mr-16">
                              <a>
                                <p className="text-left m-0 text-smaller mr-4 sm:mr-8">
                                  {category.charAt(0).toUpperCase() + category.slice(1)}
                                </p>
                              </a>
                            </Link>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </nav>
                <div className="mobile:px-10 px-4 pb-10 flex justify-center">
                  <main className="w-fw">{children}</main>
                </div>
                <footer className="flex justify-center">
                  <div className="
                  flex w-fw px-12
                  desktop:px-0
                  border-solid
                  border-t border-gray-300 items-center">
                    <span className="block text-gray-700 pt-4 pb-8 mt-2 text-xs">Copyright © 2021 JAMstack Ecommerce. All rights reserved.</span>
                    <div className="flex flex-1 justify-end">
                      <Link href="/admin">
                        <a>
                        <p className="pt-4 text-xs">Admins</p>
                        </a>
                      </Link>
                    </div>
                  </div>
                </footer>
              </div>
            )
          }
        }
      </SiteContext.Consumer>
    </ContextProviderComponent>
  )
}