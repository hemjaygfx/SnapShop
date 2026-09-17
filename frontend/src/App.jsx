
import { Show, SignInButton, SignUpButton, useAuth, UserButton } from "@clerk/react";
import PageLoader from "./components/PageLoader";
import Layout from "./components/Layout";
import { Routes, Route, Navigate } from "react-router";
import HomePage from "./pages/HomePage";
import CartPage from "./pages/CartPage";

function App() {
  const { isLoaded } = useAuth();

  if (!isLoaded) return <PageLoader />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />

        {/* TODO: build these pages when you're ready — uncomment one at a time as each page component lands in src/pages/ */}
        <Route path="/cart" element={<CartPage />} />
        {/* <Route path="/product/:slug" element={<ProductDetailPage />} /> */}
        {/* <Route path="/orders" element={isSignedIn ? <OrdersPage /> : <Navigate to={"/"} replace />} /> */}
        {/* <Route path="/checkout/return" element={<CheckoutReturnPage />} /> */}
        {/* <Route path="/demo-sentry" element={<SentryDemoPage />} /> */}
        {/* <Route path="/orders/:id/call" element={isSignedIn ? <OrderVideoPage /> : <Navigate to={"/"} replace />} /> */}
        {/* <Route path="/admin" element={isSignedIn ? <AdminProductsPage /> : <Navigate to="/" replace />} /> */}
        {/* <Route path="/orders/:id" element={<OrderDetailPage />}> */}
        {/*   <Route index element={<OrderSummaryPage />} /> */}
        {/*   <Route path="chat" element={<OrderChatPage />} /> */}
        {/* </Route> */}
      </Routes>
    </Layout>
  );
}

export default App;