import { Button } from '../';

const Center = ({ price, title, link }) => {
  return (
    <div>
      <p className="text-4xl xl:text-5xl font-bold tracking-widest leading-none">{title}</p>
      <p>FROM <span>${price}</span></p>
      <Button
        onClick={() => {}}
        title="Shop Now"
      />
    </div>
  )
}

export default Center