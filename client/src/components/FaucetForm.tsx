import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { ClipLoader } from "react-spinners"
import Select from 'react-select'

import './styles/FaucetForm.css'
import ReCaptcha from './ReCaptcha'
import FooterBox from './FooterBox'
import queryString from 'query-string'
import { DropdownOption } from './types'
import { connectAccount } from './Metamask'
import { AxiosResponse } from 'axios'
import { ChainType, ERC20Type } from '../../../vms/config-types'

const FaucetForm = (props: any) => {
    const [chain, setChain] = useState<number | null>(null)
    const [token, setToken] = useState<number | null>(null)
    const [widgetID, setwidgetID] = useState(new Map())
    const [recaptcha, setRecaptcha] = useState<ReCaptcha | undefined>(undefined)
    const [isV2, setIsV2] = useState<boolean>(false)
    const [chainConfigs, setChainConfigs] = useState<ChainType[]>([])
    const [tokenConfigs, setTokenConfigs] = useState<ERC20Type[]>([])
    const [inputAddress, setInputAddress] = useState<string>("")
    const [address, setAddress] = useState<string | null>(null)
    const [faucetAddress, setFaucetAddress] = useState<string | null>(null)
    const [options, setOptions] = useState<DropdownOption[]>([])
    const [tokenOptions, setTokenOptions] = useState<DropdownOption[]>([]);
    const [balance, setBalance] = useState<string>("0")
    const [shouldAllowSend, setShouldAllowSend] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [isFetchingBalance, setIsFetchingBalance] = useState<AbortController | null>(null)
    const [sendTokenResponse, setSendTokenResponse] = useState<any>({
        txHash: null,
        message: null
    })

    const joinedTokens = [ ...chainConfigs, ...tokenConfigs].filter((c) => c.DRIP_AMOUNT !== 0)

    // Update chain configs
    useEffect(() => {
        setRecaptcha(new ReCaptcha(
            props.config.SITE_KEY,
            props.config.ACTION,
            props.config.V2_SITE_KEY,
            setwidgetID
        ))
        updateChainConfigs()
        updateTokenConfigs()
        connectAccount(updateAddress, false)

    }, [])

    // Update balance whenver chain changes or after transaction is processed
    useEffect(() => {
        if (chain !== null && chainConfigs.length > 0) {
            // Abort pending requests
            const controller = new AbortController();
            if (isFetchingBalance) {
                isFetchingBalance.abort()
            }
            setIsFetchingBalance(controller)

            const { chain, erc20 } = getChainParams()

            props.axios.get(props.config.api.getBalance, {
                params: {
                    chain,
                    erc20
                },
                signal: controller.signal
            }).then((response: AxiosResponse) => {
              if (response?.data?.balance !== undefined) {
                setBalance(response?.data?.balance)
              }
            })
        }
    }, [chain, token, sendTokenResponse, chainConfigs])

    // Make REQUEST button disabled if either address is not valid or balance is low
    useEffect(() => {
        if(address) {
            if(BigInt(balance) > calculateBaseUnit(joinedTokens[token!]?.DRIP_AMOUNT.toString(), joinedTokens[token!]?.DECIMALS)) {
                setShouldAllowSend(true)
                return
            }
        }

        setShouldAllowSend(false)
    }, [address, balance])

    useEffect(() => {
        updateFaucetAddress()
    }, [chain, chainConfigs])

    useEffect(() => {
        const chainOptions: DropdownOption[] = [];

        chainConfigs?.forEach((chain: any, i: number) => {
            if (!chain.CONTRACTADDRESS) {
                const item = <div className='select-dropdown'>
                    <img alt = { chain.NAME[0] } src = { chain.IMAGE } />
                    { chain.NAME }
                </div>
                chainOptions.push({
                    label: item,
                    value: i,
                    search: chain.NAME
                })
            }
        })

        setOptions(chainOptions)
        setChain(chainOptions[0]?.value)
    }, [chainConfigs])

    useEffect(() => {
        const tokenOptions: DropdownOption[] = []
        const { chain: selectedChain } = getChainParams();

        chainConfigs.forEach((chain, i) => {
            if(chain.ID === selectedChain && chain.DRIP_AMOUNT !== 0) {
                tokenOptions.push({
                    label: createTokenOption(chain, selectedChain, "Native"),
                    value: i,
                    search: chain.NAME
                })
            }
        })
        tokenConfigs.forEach((token, i) => {
            if ((token.CONTRACTADDRESS && token.HOSTID === selectedChain)) {
                tokenOptions.push({
                    label: createTokenOption(token, selectedChain, "ERC20"),
                    value: i + 1,
                    search: token.NAME
                })
            }
        })

        setTokenOptions(tokenOptions)
        setToken(tokenOptions?.[0]?.value)
    }, [chainConfigs, tokenConfigs, chain])

    const createTokenOption = (config: ERC20Type | ChainType, selectedChain: string, type: string) => (
        <div className='select-dropdown'>
            <img alt={ config.NAME[0] } src={ config.IMAGE } />
            { config.ID === selectedChain ? config.TOKEN : config.NAME }

            <span style={{color: 'rgb(180, 180, 183)', fontSize: "10px", marginLeft: "5px"}}>
            {type}
            </span>
        </div>
    )

    const getConfigByTokenAndNetwork = (token: any, network: any): number => {
        let selectedConfig = 0;

        try {
            token = token?.toUpperCase();
            network = network?.toUpperCase();

            chainConfigs.forEach((chain: any, i: number): any => {
                if(chain.TOKEN == token && chain.HOSTID == network) {
                    selectedConfig = i;
                }
            })
        } catch(err: any) {
            console.log(err)
        }

        return selectedConfig;
    }

    let totalTokens: boolean = tokenOptions?.length === 0;

    useEffect(() => {
        const query = queryString.parse(window.location.search)

        const { address, subnet, erc20 } = query

        const tokenIndex: number = getConfigByTokenAndNetwork(erc20, subnet)

        if(typeof address == "string") {
            updateAddress(address)
        }

        if(typeof subnet == "string") {
            setChain(chainToIndex(subnet))
            if(typeof erc20 == "string") {
                setToken(tokenIndex)
            }
        } else {
            setChain(0)
        }
    }, [window.location.search, options, totalTokens])

    // API calls
    async function updateChainConfigs(): Promise<void> {
        const response: AxiosResponse = await props.axios.get(
            props.config.api.getChainConfigs
        )
        setChainConfigs(response?.data)
    }

    async function updateTokenConfigs(): Promise<void> {
        const response: AxiosResponse = await props.axios.get(
            props.config.api.getTokenConfigs
        )
        setTokenConfigs(response?.data)
    }


    function getChainParams(): {chain: string, erc20: string} {
        return {
            chain: chainConfigs[chain!]?.ID,
            erc20: joinedTokens[token!]?.ID
        }
    }

    async function updateFaucetAddress(): Promise<void> {
        if((chain || chain == 0) && chainConfigs.length > 0) {
            let { chain } = getChainParams()

            const response: AxiosResponse = await props.axios.get(props.config.api.faucetAddress, {
                params: {
                    chain
                }
            })

            if(response?.data) {
                setFaucetAddress(response?.data?.address)
            }
        }
    }

    function calculateBaseUnit(amount: string = "0", decimals: number = 18): BigInt {
        for(let i = 0; i < decimals; i++) {
            amount += "0"
        }
        return BigInt(amount)
    }

    function calculateLargestUnit(amount: string = "0", decimals: number = 18): string {
        let base = "1"
        for(let i = 0; i < decimals; i++) {
            base += "0"
        }
        return (BigInt(amount) / BigInt(base)).toString()
    }

    function chainToIndex(id: any): number | null {
        if(chainConfigs?.length > 0) {
            if(typeof id == "string") {
                id = id.toUpperCase()
            }
            let index: number = 0
            chainConfigs.forEach((chain: any, i: number) => {
                if(id == chain.ID) {
                    index = i
                }
            })
            return index
        } else {
            return null
        }
    }

    function updateAddress(addr: any): void {
        setInputAddress(addr!)

        if (addr) {
            if (ethers.utils.isAddress(addr)) {
                setAddress(addr)
            } else {
                setAddress(null)
            }
        } else if (address != null) {
            setAddress(null)
        }
    }

    async function getCaptchaToken(index: number = 0): Promise<{token?:string, v2Token?: string}> {
        const { token, v2Token } = await recaptcha!.getToken(isV2, widgetID, index)
        return { token, v2Token }
    }

    function updateChain(option: any): void {
        let chainNum: number = option.value

        if(chainNum >= 0 &&  chainNum < chainConfigs.length) {
            setChain(chainNum)
            back()
        }
    }

    function updateToken(option: any): void {
        let tokenNum: number = option.value

        if(tokenNum >= 0 &&  tokenNum < joinedTokens.length) {
            setToken(tokenNum)
            back()
        }
    }

    const ifCaptchaFailed = (data: any, index: number = 0, reload: boolean = false) => {
        if(typeof data?.message == "string") {
            if(data.message.includes("Captcha verification failed")) {
                setIsV2(true)
                recaptcha?.loadV2Captcha(props.config.V2_SITE_KEY, widgetID, index, reload);
            }
        }
    }

    async function sendToken(): Promise<void> {
        if(!shouldAllowSend) {
            return
        }
        let data: any
        try {
            setIsLoading(true)

            const { token, v2Token } = await getCaptchaToken()

            let { chain, erc20 } = getChainParams()

            const response = await props.axios.post(props.config.api.sendToken, {
                address,
                token,
                v2Token,
                chain,
                erc20
            })
            data = response?.data
        } catch(err: any) {
            data = err?.response?.data || err
        }

        ifCaptchaFailed(data)

        setSendTokenResponse({
            txHash: data?.txHash,
            message: data?.message
        })

        setIsLoading(false)
    }

    const getOptionByValue = (value: any): DropdownOption => {
        let selectedOption: DropdownOption = options[0]
        options.forEach((option: DropdownOption): void => {
            if(option.value == value) {
                selectedOption = option
            }
        })
        return selectedOption
    }

    const getTokenOptionByValue = (value: any): DropdownOption => {
        let selectedOption: DropdownOption = tokenOptions[0]
        tokenOptions.forEach((option: DropdownOption): void => {
            if(option.value == value) {
                selectedOption = option
            }
        })
        return selectedOption
    }

    const customStyles = {
        control: (base: any, state: { isFocused: any }) => ({
            ...base,
            background: "rgb(30, 32, 50)",
            borderRadius: state.isFocused ? "5px 5px 0 0" : 5,
            borderColor: state.isFocused ? "white" : "rgb(30, 32, 50)",
            boxShadow: null,
            "&:hover": {
                borderColor: "white"
            }
        }),
        menu: (base: any) => ({
            ...base,
            borderRadius: 0,
            marginTop: 0,
            background: "rgb(30, 32, 50)",
            color: "white"
        }),
        menuList: (base: any) => ({
            ...base,
            padding: 0,
            "::-webkit-scrollbar": {
                width: "2px"
            },
            "::-webkit-scrollbar-track": {
                background: "black"
            },
            "::-webkit-scrollbar-thumb": {
                background: "#888"
            },
            "::-webkit-scrollbar-thumb:hover": {
                background: "#555"
            }
        }),
        option: (styles: any, {isFocused, isSelected}: any) => ({
            ...styles,
            background: isFocused
                    ?
                    'rgb(43, 44, 65)'
                    :
                    isSelected
                    ?
                    'rgb(30, 32, 50)'
                    :
                    undefined,
            zIndex: 1
        }),
        input: (base: any) => ({
            ...base,
            color: "white"
        }),
        singleValue: (base: any) => ({
            ...base,
            color: "white"
        })
    }

    const ChainDropdown = () => (
        <div style={{width: "100%", marginTop: "5px"}}>
            <Select
                options={options}
                value={getOptionByValue(chain)}
                onChange={updateChain}
                styles={customStyles}
                getOptionValue ={(option: any)=>option.search}
            />
        </div>
    )

    const TokenDropdown = () => (
        <div style={{width: "100%"}}>
            <Select
                options={tokenOptions}
                value={getTokenOptionByValue(token)}
                onChange={updateToken}
                styles={customStyles}
                getOptionValue ={(option: any)=>option.search}
            />
        </div>
    )

    const resetRecaptcha = (): void => {
        setIsV2(false)
        recaptcha!.resetV2Captcha(widgetID)
    }

    const back = (): void => {
        resetRecaptcha()
        setSendTokenResponse({
            txHash: null,
            message: null
        })
    }

    const toString = (mins: number): string => {
        if(mins < 60) {
            return `${mins} minute${mins > 1 ? 's' : ''}`
        } else {
            const hour = ~~(mins / 60)
            const minute = mins % 60

            if(minute == 0) {
                return `${hour} hour${hour > 1 ? 's' : ''}`
            } else {
                return `${hour} hour${hour > 1 ? 's' : ''} and ${minute} minute${minute > 1 ? 's' : ''}`
            }
        }
    }

    return (
        <div className='container'>
            <div className = "box">
                <div className='banner' style={{backgroundImage: `url(${props.config.banner})`}}/>

                <div className='box-content'>
                    <div className='box-header'>
                        <span>
                            <span style={{color: "grey"}}>Select Network</span>
                        </span>

                        <ChainDropdown /> <br/>

                        <div>
                            <div style={{width: "100%"}}>
                                <span style={{color: "grey", fontSize: "12px", float: "right"}}>
                                    Faucet balance: {calculateLargestUnit(balance, joinedTokens[token!]?.DECIMALS)} {joinedTokens[token!]?.TOKEN}
                                </span>

                                <span style={{color: "grey", fontSize: "12px"}}>
                                    Select Token
                                </span>

                                <TokenDropdown/>
                            </div>
                        </div>
                    </div>

                    <br/>

                    <div style={{ display: sendTokenResponse?.txHash ? "none" : "block" }}>
                        <p className='rate-limit-text'>
                            Drops are limited to
                            <span>
                                {joinedTokens[token!]?.RATELIMIT?.MAX_LIMIT} request in {toString(joinedTokens[token!]?.RATELIMIT?.WINDOW_SIZE)}.
                            </span>
                        </p>

                        <div className='address-input'>
                            <input
                                placeholder='Hexadecimal Address (0x...)'
                                value={inputAddress || ""}
                                onChange={(e) => updateAddress(e.target.value)}
                                autoFocus
                            />

                            <span className='connect-metamask' onClick={ () => connectAccount(updateAddress) }>
                                <img alt='metamask' src="/memtamask.webp"/>
                                Connect
                            </span>
                        </div>
                        <span className='rate-limit-text' style={{color: "red"}}>{sendTokenResponse?.message}</span>

                        <div className='v2-recaptcha' style={{marginTop: "10px"}}></div>

                        <div className="beta-alert">
                            <p>This is a testnet faucet. Funds are not real.</p>
                        </div>

                        <button className={shouldAllowSend ? 'send-button' : 'send-button-disabled'} onClick={sendToken}>
                            {
                                isLoading
                                ?
                                <ClipLoader size="20px" speedMultiplier={0.3} color="403F40"/>
                                :
                                <span>Request {joinedTokens[token || 0]?.DRIP_AMOUNT} {joinedTokens[token || 0]?.TOKEN}</span>
                            }
                        </button>
                    </div>

                    <div style={{ display: sendTokenResponse?.txHash ? "block" : "none" }}>
                        <p className='rate-limit-text'>
                            {sendTokenResponse?.message}
                        </p>

                        <div>
                            <span className='bold-text'>Transaction ID</span>
                            <p className='rate-limit-text'>
                                <a
                                    target = {'_blank'}
                                    href = {chainConfigs[token!]?.EXPLORER + '/tx/' + sendTokenResponse?.txHash}
                                    rel = "noreferrer"
                                >
                                    {sendTokenResponse?.txHash}
                                </a>
                            </p>
                        </div>

                        <button className='back-button' onClick={back}>Back</button>
                    </div>
                </div>
            </div>

            <FooterBox
                chain = {chain}
                token = {token}
                chainConfigs = {chainConfigs}
                chainToIndex = {chainToIndex}
                faucetAddress = {faucetAddress}
            />
        </div>


    )
}

export default FaucetForm