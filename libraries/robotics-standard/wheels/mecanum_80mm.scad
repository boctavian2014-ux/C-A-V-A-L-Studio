module mecanum_hub(d=80,w=30){
  difference(){
    cylinder(h=w,r=d/2,$fn=64);
    translate([0,0,-0.1]) cylinder(h=w+0.2,r=5,$fn=28);
  }
}
mecanum_hub();
