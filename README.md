![x402 Testing Tool](src/assets/logo.png)

# x420 Testing Tool

This is a tool for testing x402-enabled services. Typically you either develop a service with a x402 paywall, or you develop a client that consumes an API with a x402 paywall. You typically don't develop both, so instead of spending time mocking either the client or the server, you can use the **x402 Testing Tool** and focus on the real task.

## How to use
This tool can be used to test existing x402-enabled clients and endpoints, but the easiest way to get familiar with the tool is to create an endpoint with the **Server Simulator**, and then test it with the **Client Simulator**. Switch between the Server and Client Simulators with the two buttons in the header.

### Server Simulator
Fill out the form on the left side of the page, after selecting the Server Simulater in the header. There are three tabs to pay attention to, the first is __Endpoint & Payment__ that allows you to define the endpoint, payment currency (XLM or USDC) and amount, among other things.

The second tab you can add the __Success Response__. If you are simulating a known endpoint and know what a successful response look like, you can paste it in here. The same goes for __Failure Response__, where you can define the response in case the request is not successful.

#### Example
sadfsdffsdfsdf






## How it's build




## Next step
Due to time constraints there are a couple og things that didn't go into this project. The things that should be prioritized for future updates are:

* Adding support for Mainnet, a lot of the work has been done, but it has not been tested yet
* Adding user accounts (wallet/passkeys login) so only _your_ simulated endpoints and log is shown
* Extensive testing, this is very much a rough prototype and it has gone through very limited testing
* Adding sponsored transactions, right now it's using a personal testnet account to pay for transactions

