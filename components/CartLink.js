import { useState, useEffect } from 'react'
import { SiteContext } from '../context/mainContext'
import { FaShoppingCart, FaCircle } from 'react-icons/fa';
import Link from "next/link"
import { colors } from '../theme'
const { primary } = colors

function CartLink(props) {
  const [renderClientSideComponent, setRenderClientSideComponent] = useState(false)
  useEffect(() => {
    setRenderClientSideComponent(true)
  }, [])
  let { context: { numberOfItemsInCart = 0 }} = props
  return (
    <div>
      <div className="fixed top-53 right-24 desktop:right-flexiblemargin z-10">
        <div className="flex flex-1 justify-end pr-4 relative">
          <Link href="/cart">
            <a>
              <FaShoppingCart />
            </a>
          </Link>
          {
            renderClientSideComponent && numberOfItemsInCart > Number(0) && (
              <FaCircle color={primary} size={12} suppressHydrationWarning />
            )
          }
        </div>
      </div>
    </div>
  )
}

function CartLinkWithContext(props) {
  return (
    <SiteContext.Consumer>
      {
        context => <CartLink {...props} context={context} />
      }
    </SiteContext.Consumer>
  )
}


export default CartLinkWithContext