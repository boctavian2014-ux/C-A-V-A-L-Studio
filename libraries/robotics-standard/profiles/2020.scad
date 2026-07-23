module profile_2020(len=40){
  difference(){
    cube([20,20,len]);
    translate([5,5,-0.1]) cube([10,10,len+0.2]);
  }
}
profile_2020();
