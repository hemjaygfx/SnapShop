
import { Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import PageLoader from './components/PageLoader.jsx';
import Layout from './components/Layout.jsx';


function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <PageLoader />;

  return (
    <Layout>
    <header>
        <Show when="signed-out">
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

    <p className='text-red-400'>Hello, World!</p>
    <button className='btn btn-primary'>Primary Button</button>

    </Layout>
  )
}

export default App
