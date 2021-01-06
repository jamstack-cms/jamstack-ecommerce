import Link from 'next/link'
import { slugify } from '../utils/helpers'
import 'react-toastify/dist/ReactToastify.css'
import { ToastContainer } from 'react-toastify'
import { navItemLength } from '../ecommerce.config'

export default function Layout({ children, categories }) {
  if (categories.length > navItemLength) {
    categories = categories.slice(0, navItemLength)
  }
  return (
    <div>
      <nav>
        <div className="flex justify-center">
          <div className="px-4 pt-12 pb-6 flex flex-col w-fw mobile:px-12 sm:flex-row  desktop:px-0">
            <Link href="/">
              <a>
                <div className="mb-4 sm:mr-16">
                  <img src="/logo.png" alt="logo" width="90" height="28" />
                </div>
              </a>
            </Link>
            <div className="flex flex-wrap mt-1">
              <Link href="/">
                <a>
                  <p className="
                    sm:mr-8 sm:mb-0
                    mb-4 text-left text-smaller mr-4
                  ">
                  Home
                  </p>
                </a>
              </Link>
              {
                categories.map((category, index) => (
                  <Link
                    href={`/category/${slugify(category)}`}
                    key={index}
                  >
                    <a>
                      <p className="
                          sm:mr-8 sm:mb-0
                          mb-4 text-left text-smaller mr-4
                        ">
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </p>
                    </a>
                  </Link>
                ))
              }
              <Link href="/categories">
                <a>
                  <p className="
                    sm:mr-8 sm:mb-0
                    mb-4 text-left text-smaller mr-4 
                  ">
                  All
                  </p>
                </a>
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <div className="mobile:px-10 px-4 pb-10 flex justify-center">
        <main className="w-fw">{children}</main>
      </div>
      <footer className="flex justify-center">
        <div className="
        sm:flex-row sm:items-center
        flex-col
        flex w-fw px-12 py-8
        desktop:px-0
        border-solid
        border-t border-gray-300">
          <span className="block text-gray-700 text-xs">Copyright © 2021 JAMstack Ecommerce. All rights reserved.</span>
          <div className="
            sm:justify-end sm:m-0
            flex flex-1 mt-4
          ">
            <Link href="/admin">
              <a>
              <p className="text-sm font-semibold">Admins</p>
              </a>
            </Link>
          </div>
        </div>
      </footer>
      <ToastContainer autoClose={3000} />
    </div>
  )
}