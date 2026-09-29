import {forwardRef,useEffect,useLayoutEffect,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import '../../styles/controls.css'

const paths={
  more:'M5 12h.01M12 12h.01M19 12h.01', close:'M6 6l12 12M18 6L6 18',
  clip:'M8 13l7-7a3 3 0 014 4l-9 9a5 5 0 01-7-7l9-9',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',
  note:'M5 3h14v18H5zM9 8h6M9 12h6M9 16h4',
  book:'M12 5v15M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z',
  moon:'M20 14A8 8 0 0110 4a8 8 0 1010 10Z',
  chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  bell:'M18 8a6 6 0 00-12 0c0 8-3 8-3 9h18c0-1-3-1-3-9M10 21h4',
  settings:'M4 7h16M4 17h16M8 4v6M16 14v6',
  spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  expand:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  arrow:'M5 12h14M13 6l6 6-6 6',
  mic:'M9 5a3 3 0 016 0v7a3 3 0 01-6 0zM5 10v2a7 7 0 0014 0v-2M12 19v3',
} as const
export type IconName=keyof typeof paths
export function Icon({name}:{name:IconName}):JSX.Element{return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name==='more'?3:1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>}
export const Button=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'quiet'|'danger';icon?:IconName;iconOnly?:boolean}>(function Button({variant='secondary',icon,iconOnly=false,className='',children,...props},ref){
  return <button type="button" {...props} ref={ref} className={'fn-button fn-'+variant+(iconOnly?' fn-icon-button':'')+' '+className}>{icon&&<Icon name={icon}/>}<span>{children}</span></button>
})
export interface MenuItem {label:string;onSelect:()=>void;icon?:IconName;disabled?:boolean;danger?:boolean;separator?:boolean}
export function ActionMenu({label='更多操作',items,children}:{label?:string;items:MenuItem[];children?:ReactNode}):JSX.Element{
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0})
  const [present,setPresent]=useState(false)
  const animation=useRef<Animation|null>(null)
  const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null)
  const close=(restore=false):void=>{setOpen(false);if(restore)trigger.current?.focus({ preventScroll: true })}
  useLayoutEffect(()=>{
    const node=menu.current
    if(!node)return
    node.inert=!open
    const box=trigger.current!.getBoundingClientRect(),height=node.offsetHeight||200
    const below=box.bottom+height+12<window.innerHeight
    if(open){
      setPresent(true)
      setPosition({left:Math.max(8,Math.min(box.right-224,window.innerWidth-232)),top:below?box.bottom+6:Math.max(8,box.top-height-6)})
      node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    }
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const start=animation.current?{opacity:getComputedStyle(node).opacity,transform:getComputedStyle(node).transform}:{opacity:open?0:1,transform:open&&!reduced?'translateY('+(below?'-6px':'6px')+')':'none'}
    animation.current?.cancel()
    if(!node.animate){if(!open)setPresent(false);return}
    const current=node.animate([start,{opacity:open?1:0,transform:!open&&!reduced?'translateY('+(below?'-6px':'6px')+')':'none'}],{duration:reduced?80:160,easing:'cubic-bezier(0.23, 1, 0.32, 1)'})
    animation.current=current
    current.onfinish=()=>{if(animation.current===current){animation.current=null;if(!open)setPresent(false)}}
  },[open])
  useEffect(()=>()=>{animation.current?.cancel()},[])
  useEffect(()=>{
    if(!open)return
    const outside=(e:PointerEvent):void=>{if(!menu.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))close()}
    const dismiss=():void=>close()
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss)
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss)}
  },[open])
  // Portals inside a modal must remain inside its top layer and focus boundary.
  const host=trigger.current?.closest('dialog')||document.body
  return <><Button ref={trigger} variant="quiet" icon={children?undefined:'more'} iconOnly={!children} title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{children}</Button>
    {(open||present)&&createPortal(<div ref={menu} className="fn-menu" role="menu" aria-hidden={!open} aria-label={label} style={position} onKeyDown={e=>{
      const buttons=[...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement)
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true)}
      else if(e.key==='Tab')close(true)
      else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus({ preventScroll: true })}
    }}>{items.map((item,i)=><button key={i} role="menuitem" className={(item.danger?'danger ':'')+(item.separator?'separated':'')} disabled={item.disabled} onClick={()=>{close(true);item.onSelect()}}>{item.icon&&<Icon name={item.icon}/>}<span>{item.label}</span></button>)}</div>,host)}</>
}
