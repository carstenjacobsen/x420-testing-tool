![x402 Testing Tool](src/assets/logo.png)

# x402 Testing Tool

This is a tool for testing x402-enabled services. Typically you either develop a service with a x402 paywall, or you develop a client that consumes an API with a x402 paywall. You typically don't develop both, so instead of spending time mocking either the client or the server, you can use the **x402 Testing Tool** and focus on the real task.

Try the live x402 Testing Tool live here: [https://x402test.org](x402test.org)

## How to use
This tool can be used to test existing x402-enabled clients and endpoints, but the easiest way to get familiar with the tool is to create an endpoint with the **Server Simulator**, and then test it with the **Client Simulator**. Switch between the Server and Client Simulators with the two buttons in the header.

### Server Simulator
Fill out the form on the left side of the page, after selecting the _Server Simulater_ in the header. There are three tabs to pay attention to, the first is __Endpoint & Payment__ that allows you to define the endpoint, payment currency (XLM or USDC) and amount, among other things.

The second tab you can add the __Success Response__. If you are simulating a known endpoint and know what a successful response look like, you can paste it in here. The same goes for __Failure Response__, where you can define the response in case the request is not successful.

**Example**<br/>
Let's create an endpoint we can't use for testing the client. This would be a typical configuration:

* **Method**: POST
* **Path**: "premium-content"
* **Network**: Stellar Testnet
* **Asset**: USDC
* **Amount Required**: 0.01
* **Receiving Address**: Any Stellar address with USDC trustline*

*) Use [Stellar Lab](https://lab.stellar.org) to create an account

For trying out this tool, just leave the _Success Response_ and _Failure Response_ as is. 

Click **Create Endpoint** to setup the endpoint. The endpoint will be listed under the form. The endpoint can be called using the URL shown in **Simulated Endpoints** - formatted like this: `https://api.x402test.org/sim/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`. 

The _Log_ on the right side will track all requests made to the endpoint.

### Client Simulator
The _Client Simulator_ can be used to test any x402-enabled endpoint, including the endpoint created in the _Server Simulator_. Let's test the client feature by making a request to the endpoint we just created - but any x402-enabled endpoint would work.

First, click the **Client Simulator** button in the header. Next, connect your wallet - currently only the Freighter wallet is supported. Then enter the endpoint and click **Send Request** - use the endpoint created in the previous step if you don't have a specific external endpoint you want to test.

When clicking the **Send Request** button, the client will make the request, the request will get a 402 status code response, build the payment and resubmit the request, and then return the response from the called API endpoint. The responses and payloads for each step will be logged and visible on the left side in realtime.

## How it's build
The x402 Testing Tool consists of a backend and a frontend. The backend handles all the requests, storing endpoints and log etc. The frontend handles the x402 requests.

The tech stack consists of:

* React/TypeScript/Vite
* Express library
* Stellar SDK
* x402 Library
* Tailwind CSS

The backend code is in the `server` folder, and the frontend code is in the `source` folder. 

## Next step
Due to time constraints there are a couple og things that didn't go into this project. The things that should be prioritized for future updates are:

* Adding support for Mainnet, a lot of the work has been done, but it has not been tested yet
* Adding user accounts (wallet/passkeys login) so only _your_ simulated endpoints and log is shown
* Extensive testing, this is very much a rough prototype and it has gone through very limited testing
* Adding sponsored transactions, right now it's using a personal testnet account to pay for transactions
* Adding support for more wallets

