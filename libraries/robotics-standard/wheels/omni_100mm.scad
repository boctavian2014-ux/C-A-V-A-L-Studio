module omni_hub(d=100,w=18){
  difference(){
    cylinder(h=w,r=d/2,$fn=80);
    translate([0,0,-0.1]) cylinder(h=w+0.2,r=6,$fn=32);
  }
}
omni_hub();
