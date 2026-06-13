# GreenGuard CO2 Trap Timer

## Enclosure Drilling Template

### Enclosure: Zulkit IP65 ABS 100x68x50mm (or equivalent)

-----

## Enclosure Lid (Top Face) — 100mm x 68mm

```
┌──────────────────────────────────────────────────────┐  100mm
│                                                      │
│   ●  ●                                               │  ← LED1 (Green) & LED2 (Blue)
│  [20,10] [28,10]   3mm diameter holes                │    from left edge
│                                                      │
│                                                      │
│                                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
         68mm
```

### Lid Holes:

|Hole|Position (X,Y from top-left)|Diameter|Purpose        |
|----|----------------------------|--------|---------------|
|LED1|20mm, 10mm                  |3.2mm   |Green power LED|
|LED2|28mm, 10mm                  |3.2mm   |Blue valve LED |

-----

## Enclosure Left Side Face — 50mm x 68mm

```
┌────────────────────────────────────┐  68mm
│                                    │
│                                    │
│   ◎                                │  ← PG7 Cable Gland (CO2 IN from regulator)
│  [25,25]                           │
│                                    │
└────────────────────────────────────┘
         50mm
```

### Left Side Holes:

|Hole          |Position (X,Y from top-left)|Diameter|Purpose                      |
|--------------|----------------------------|--------|-----------------------------|
|Cable Gland IN|25mm, 25mm                  |12mm    |PG7 cable gland — CO2 hose IN|

-----

## Enclosure Right Side Face — 50mm x 68mm

```
┌────────────────────────────────────┐  68mm
│                                    │
│                                    │
│                               ◎    │  ← PG7 Cable Gland (CO2 OUT to trap)
│                          [25,25]   │
│                                    │
└────────────────────────────────────┘
         50mm
```

### Right Side Holes:

|Hole           |Position (X,Y from top-left)|Diameter|Purpose                       |
|---------------|----------------------------|--------|------------------------------|
|Cable Gland OUT|25mm, 25mm                  |12mm    |PG7 cable gland — CO2 hose OUT|

-----

## Enclosure Front Face — 100mm x 50mm

```
┌──────────────────────────────────────────────────────┐  100mm
│                                                      │
│                                                      │
│                    ○                                 │  ← SYNC button access hole
│                  [50,25]                             │
│                                                      │
└──────────────────────────────────────────────────────┘
         50mm
```

### Front Face Holes:

|Hole       |Position (X,Y from top-left)|Diameter|Purpose           |
|-----------|----------------------------|--------|------------------|
|SYNC button|50mm, 25mm                  |8mm     |Sync button access|

-----

## PCB Standoffs

- 4x M3 brass standoffs, 10mm height
- Positions match PCB mounting holes: 3mm inset from each corner
- PCB sits 10mm above enclosure base

-----

## Assembly Notes

1. Install PG7 cable glands in left and right side holes before PCB installation
1. Thread CO2 tubing through glands BEFORE connecting barb fittings
1. Secure PCB on standoffs with M3 screws
1. Route solenoid wires to J2 screw terminal
1. Route 9V battery snap lead to J1 screw terminal
1. Velcro battery to inside base of enclosure
1. Seal glands hand-tight — do not overtighten (IP65 sealing)
1. LED legs bend 90° to align with lid holes — secure with hot glue inside lid